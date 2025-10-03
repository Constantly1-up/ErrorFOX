// Класс для работы с пользовательскими настройками
class UserPreferences {
    constructor() {
        this.history = [];
        this.theme = 'light';
        this.likes = new Map();
        this.feedbackCounts = new Map();
        this.loadPreferences();
    }

    toggleLike(errorCode, solutionIndex) {
        const key = `${errorCode}-${solutionIndex}`;
        const isLiked = this.likes.get(key) || false;
        
        if (isLiked) {
            this.likes.delete(key);
            const currentCount = this.feedbackCounts.get(key) || 0;
            this.feedbackCounts.set(key, Math.max(0, currentCount - 1));
        } else {
            this.likes.set(key, true);
            const currentCount = this.feedbackCounts.get(key) || 0;
            this.feedbackCounts.set(key, currentCount + 1);
        }
        
        this.savePreferences();
        return !isLiked;
    }

    isLiked(errorCode, solutionIndex) {
        const key = `${errorCode}-${solutionIndex}`;
        return this.likes.get(key) || false;
    }

    getFeedbackCount(errorCode, solutionIndex) {
        const key = `${errorCode}-${solutionIndex}`;
        return this.feedbackCounts.get(key) || 0;
    }

    addToHistory(error) {
        this.history = this.history.filter(item => item.code !== error.code);
        this.history.unshift({
            code: error.code,
            title: error.title,
            category: error.category,
            timestamp: new Date().toISOString()
        });
        this.history = this.history.slice(0, 20);
        this.savePreferences();
    }

    getHistory() {
        return this.history;
    }

    clearHistory() {
        this.history = [];
        this.savePreferences();
    }

    setTheme(theme) {
        this.theme = theme;
        this.savePreferences();
    }

    getTheme() {
        return this.theme;
    }

    savePreferences() {
        localStorage.setItem('errorfoxbase_prefs', JSON.stringify({
            history: this.history,
            theme: this.theme,
            likes: Array.from(this.likes.entries()),
            feedbackCounts: Array.from(this.feedbackCounts.entries())
        }));
    }

    loadPreferences() {
        try {
            const prefs = JSON.parse(localStorage.getItem('errorfoxbase_prefs') || '{}');
            this.history = prefs.history || [];
            this.theme = prefs.theme || 'light';
            this.likes = new Map(prefs.likes || []);
            this.feedbackCounts = new Map(prefs.feedbackCounts || []);
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
            this.history = [];
            this.theme = 'light';
            this.likes = new Map();
            this.feedbackCounts = new Map();
        }
    }
}

// Класс для работы с базой данных ErrorFOXbase
class ErrorDatabaseService {
    constructor() {
        this.categories = new Map();
        this.subcategories = new Map();
        this.errors = new Map();
        this.isLoaded = false;
    }

    async initialize() {
        try {
            this.showLoading();
            
            // Загружаем данные из внешних JSON файлов
            const [categoriesData, subcategoriesData, errorsData] = await Promise.all([
                this.loadJSON('categories.json'),
                this.loadJSON('subcategories.json'), 
                this.loadJSON('errors.json')
            ]);

            // Обрабатываем категории
            this.categories = new Map();
            for (const [id, category] of Object.entries(categoriesData)) {
                this.categories.set(id, category);
            }

            // Обрабатываем подкатегории  
            this.subcategories = new Map();
            for (const [categoryId, subcats] of Object.entries(subcategoriesData)) {
                this.subcategories.set(categoryId, subcats);
            }

            // Обрабатываем ошибки - убираем дубликаты
            this.errors = new Map();
            const seenCodes = new Set();
            
            for (const [code, error] of Object.entries(errorsData)) {
                if (seenCodes.has(code)) {
                    console.warn(`Дубликат ошибки ${code} пропущен`);
                    continue;
                }
                seenCodes.add(code);
                
                // Нормализуем данные ошибки
                const normalizedError = this.normalizeError(error);
                this.errors.set(code, normalizedError);
            }
            
            this.isLoaded = true;
            console.log(`Загружено: ${this.categories.size} категорий, ${this.errors.size} ошибок`);
            this.hideLoading();
            return true;
        } catch (error) {
            console.error('Ошибка загрузки базы данных:', error);
            this.hideLoading();
            this.showErrorMessage('Не удалось загрузить базу данных. Проверьте наличие файлов JSON.');
            return false;
        }
    }

    // Нормализация данных ошибки для совместимости с кодом
    normalizeError(error) {
        const normalized = { ...error };
        
        // Нормализуем риск в решениях
        if (normalized.solutions) {
            normalized.solutions = normalized.solutions.map(solution => ({
                ...solution,
                risk: this.normalizeRisk(solution.risk)
            }));
        }
        
        return normalized;
    }

    // Конвертация риска из русского в английский
    normalizeRisk(risk) {
        const riskMap = {
            'низкий': 'low',
            'средний': 'medium', 
            'высокий': 'high',
            'low': 'low',
            'medium': 'medium',
            'high': 'high'
        };
        return riskMap[risk] || 'low';
    }

    async loadJSON(filename) {
        try {
            const response = await fetch(filename);
            if (!response.ok) {
                throw new Error(`Не удалось загрузить ${filename}: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Ошибка загрузки ${filename}:`, error);
            // Возвращаем пустые данные вместо падения приложения
            return this.getFallbackData(filename);
        }
    }

    getFallbackData(filename) {
        const fallbacks = {
            'categories.json': {},
            'subcategories.json': {},
            'errors.json': {}
        };
        return fallbacks[filename] || {};
    }

    showLoading() {
        document.getElementById('loadingSection').classList.remove('hidden');
        this.hideAllSections();
    }

    hideLoading() {
        document.getElementById('loadingSection').classList.add('hidden');
    }

    showErrorMessage(message) {
        const statsSection = document.getElementById('statsSection');
        statsSection.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px;"></i>
                <h3>Ошибка загрузки</h3>
                <p>${message}</p>
            </div>
        `;
    }

    hideAllSections() {
        document.getElementById('categoriesSection').classList.add('hidden');
        document.getElementById('subcategoriesSection').classList.add('hidden');
        document.getElementById('errorsSection').classList.add('hidden');
        document.getElementById('errorDetailSection').classList.add('hidden');
        document.getElementById('noResults').classList.add('hidden');
        document.getElementById('statsSection').classList.add('hidden');
    }

    getError(code) {
        return this.errors.get(code);
    }

    getErrorsByCategory(category) {
        return Array.from(this.errors.values())
            .filter(error => error.category === category);
    }

    getErrorsBySubcategory(category, subcategoryName) {
        return Array.from(this.errors.values())
            .filter(error => 
                error.category === category && 
                error.subcategory === subcategoryName
            );
    }

    searchErrors(query) {
        const lowercaseQuery = query.toLowerCase();
        return Array.from(this.errors.values())
            .filter(error => 
                error.code.toLowerCase().includes(lowercaseQuery) ||
                error.title.toLowerCase().includes(lowercaseQuery) ||
                error.description.toLowerCase().includes(lowercaseQuery) ||
                error.category.toLowerCase().includes(lowercaseQuery)
            );
    }

    getCategoryInfo(category) {
        return this.categories.get(category);
    }

    getSubcategories(category) {
        return this.subcategories.get(category) || [];
    }

    getTotalErrorsCount() {
        return this.errors.size;
    }

    getTotalSolutionsCount() {
        let total = 0;
        for (const error of this.errors.values()) {
            total += error.solutions?.length || 0;
        }
        return total;
    }
}

// Класс для управления уведомлениями
class ToastManager {
    constructor() {
        this.container = document.getElementById('toastContainer');
    }

    show(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}"></i>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
}

// Основное приложение ErrorFOXbase с универсальными исправлениями
class ErrorFOXbaseApp {
    constructor() {
        this.currentPage = 'categories';
        this.currentCategory = '';
        this.currentSubcategory = '';
        this.currentPageNumber = 1;
        this.errorsPerPage = 6;
        
        this.errorDB = new ErrorDatabaseService();
        this.userPrefs = new UserPreferences();
        this.toast = new ToastManager();
        
        this.initializeApp();
    }

    async initializeApp() {
        this.applyTheme(this.userPrefs.getTheme());
        this.setupMobileEnhancements();
        
        const success = await this.errorDB.initialize();
        
        if (success) {
            this.setupEventListeners();
            this.displayCategories();
            this.updateStats();
            this.updateStructuredData();
            this.displayHistory();
        }
    }

    // Мобильные улучшения
    setupMobileEnhancements() {
        // Предотвращение двойного тапа для масштабирования
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // Улучшение скролла на iOS
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        window.addEventListener('resize', () => {
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        });
        
        // Закрытие клавиатуры при скролле на мобильных
        if ('ontouchstart' in window) {
            let inputs = document.querySelectorAll('input[type="text"]');
            inputs.forEach(input => {
                input.addEventListener('blur', () => {
                    window.scrollTo(0, 0);
                });
            });
        }
    }

    setupEventListeners() {
        document.getElementById('searchBtn').addEventListener('click', () => this.searchError());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchError();
            }
        });
        
        document.getElementById('searchInput').addEventListener('focus', () => {
            document.getElementById('searchContainer').classList.add('focused');
            document.getElementById('searchBtn').classList.add('compact');
            document.querySelector('.search-text').style.display = 'none';
        });
        
        document.getElementById('searchInput').addEventListener('blur', () => {
            if (document.getElementById('searchInput').value === '') {
                document.getElementById('searchContainer').classList.remove('focused');
                document.getElementById('searchBtn').classList.remove('compact');
                document.querySelector('.search-text').style.display = 'inline';
            }
        });
        
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.showSuggestions(e.target.value);
            if (e.target.value === '') {
                document.getElementById('searchContainer').classList.remove('focused');
                document.getElementById('searchBtn').classList.remove('compact');
                document.querySelector('.search-text').style.display = 'inline';
            } else {
                document.getElementById('searchContainer').classList.add('focused');
                document.getElementById('searchBtn').classList.add('compact');
                document.querySelector('.search-text').style.display = 'none';
            }
        });

        document.getElementById('backToCategories').addEventListener('click', (e) => {
            e.preventDefault();
            this.showCategories();
        });
        document.getElementById('backToSubcategories').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSubcategories();
        });
        document.getElementById('backToErrors').addEventListener('click', (e) => {
            e.preventDefault();
            this.showErrorsList();
        });

        document.getElementById('copyErrorCode').addEventListener('click', () => this.copyErrorCode());
        document.getElementById('shareError').addEventListener('click', () => this.shareError());

        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('historyBtn').addEventListener('click', () => this.toggleHistory());
        document.getElementById('closeHistory').addEventListener('click', () => this.closeHistory());
        document.getElementById('overlay').addEventListener('click', () => {
            this.closeHistory();
        });

        // Исправленная навигация по breadcrumbs
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-breadcrumb-home]')) {
                e.preventDefault();
                this.showCategories();
            }
            
            if (e.target.closest('[data-breadcrumb-category]')) {
                e.preventDefault();
                this.displaySubcategories(this.currentCategory);
            }
            
            if (e.target.closest('[data-breadcrumb-subcategory]')) {
                e.preventDefault();
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) {
                document.getElementById('searchSuggestions').style.display = 'none';
            }
        });

        // Обработка изменения ориентации экрана
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
            }, 300);
        });
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }

    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        this.userPrefs.setTheme(theme);
        
        const themeIcon = document.querySelector('#themeToggle i');
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun';
        } else {
            themeIcon.className = 'fas fa-moon';
        }
    }

    toggleHistory() {
        document.getElementById('historyPanel').classList.toggle('active');
        document.getElementById('overlay').classList.toggle('active');
    }

    closeHistory() {
        document.getElementById('historyPanel').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
    }

    displayHistory() {
        const historyList = document.getElementById('historyList');
        const history = this.userPrefs.getHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = '<div class="text-center" style="color: var(--secondary); padding: 20px;">История просмотров пуста</div>';
            return;
        }
        
        historyList.innerHTML = history.map(item => {
            const categoryInfo = this.errorDB.getCategoryInfo(item.category);
            const categoryName = categoryInfo ? categoryInfo.name : item.category;
            
            return `
                <div class="history-item" data-code="${item.code}">
                    <div class="history-code">${item.code}</div>
                    <div class="history-title">${item.title}</div>
                    <small style="color: var(--secondary); margin-top: 4px;">${categoryName}</small>
                </div>
            `;
        }).join('');
        
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const code = item.dataset.code;
                this.showErrorDetail(code);
                this.closeHistory();
            });
        });
    }

    copyErrorCode() {
        const code = document.getElementById('errorDetailCode').textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.toast.show('Код ошибки скопирован', 'success');
        }).catch(() => {
            this.toast.show('Не удалось скопировать код', 'error');
        });
    }

    shareError() {
        const code = document.getElementById('errorDetailCode').textContent;
        const title = document.getElementById('errorDetailTitle').textContent;
        const url = window.location.href;
        
        const shareData = {
            title: `Ошибка ${code}: ${title}`,
            text: `Решение ошибки ${code} на ErrorFOXbase`,
            url: url
        };
        
        if (navigator.share) {
            navigator.share(shareData).catch(() => {
                this.fallbackShare(code, url);
            });
        } else {
            this.fallbackShare(code, url);
        }
    }

    fallbackShare(code, url) {
        navigator.clipboard.writeText(`${url} - Ошибка ${code}`).then(() => {
            this.toast.show('Ссылка скопирована в буфер', 'success');
        }).catch(() => {
            this.toast.show('Не удалось поделиться', 'error');
        });
    }

    handleFeedback(errorCode, solutionIndex, button) {
        const isNowLiked = this.userPrefs.toggleLike(errorCode, solutionIndex);
        const count = this.userPrefs.getFeedbackCount(errorCode, solutionIndex);
        
        if (isNowLiked) {
            button.classList.add('liked');
            button.innerHTML = '<i class="fas fa-thumbs-up"></i> Это решение помогло';
            this.toast.show('Спасибо за ваш отзыв!', 'success');
        } else {
            button.classList.remove('liked');
            button.innerHTML = '<i class="far fa-thumbs-up"></i> Это решение помогло';
            this.toast.show('Лайк удален', 'success');
        }
        
        this.updateFeedbackText(button.parentNode.querySelector('.feedback-count'), count);
    }

    updateFeedbackText(element, count) {
        const peopleText = count === 1 ? 'человеку' : 'людям';
        element.textContent = count === 0 ? 'Пока нет оценок' : `Помогло: ${count} ${peopleText}`;
    }

    // УНИВЕРСАЛЬНЫЙ МЕТОД для подсчета ошибок в субкатегории
    countErrorsInSubcategory(category, subcategoryId) {
        const categorySubcategories = this.errorDB.getSubcategories(category);
        const subcategory = categorySubcategories.find(s => s.id === subcategoryId);
        
        if (!subcategory) return 0;
        
        const subcategoryName = subcategory.name;
        let errors = this.errorDB.getErrorsBySubcategory(category, subcategoryName);
        
        // Универсальное решение для всех категорий с несовпадениями
        if (errors.length === 0) {
            const allCategoryErrors = this.errorDB.getErrorsByCategory(category);
            errors = allCategoryErrors.filter(error => {
                if (!error.subcategory) return false;
                
                // Универсальная логика для всех категорий
                const errorSub = error.subcategory.toLowerCase();
                const subName = subcategoryName.toLowerCase();
                
                // Проверяем частичное совпадение для всех категорий
                return errorSub.includes(subName) || subName.includes(errorSub);
            });
        }
        
        return errors.length;
    }

    // УНИВЕРСАЛЬНЫЙ МЕТОД для отображения ошибок по субкатегории
    displayErrorsBySubcategory(category, subcategoryId) {
        const subcategoryDisplayName = this.getSubcategoryDisplayName(category, subcategoryId);
        
        // Получаем ошибки с универсальной логикой поиска
        let errors = this.errorDB.getErrorsBySubcategory(category, subcategoryDisplayName);
        
        // Если не найдено ошибок по точному совпадению, используем универсальный поиск
        if (errors.length === 0) {
            const allCategoryErrors = this.errorDB.getErrorsByCategory(category);
            errors = allCategoryErrors.filter(error => {
                if (!error.subcategory) return false;
                
                // Универсальная логика для всех категорий
                const errorSub = error.subcategory.toLowerCase();
                const subName = subcategoryDisplayName.toLowerCase();
                
                // Проверяем частичное совпадение для всех категорий
                return errorSub.includes(subName) || subName.includes(errorSub);
            });
        }
        
        const startIndex = (this.currentPageNumber - 1) * this.errorsPerPage;
        const endIndex = startIndex + this.errorsPerPage;
        const errorsToShow = errors.slice(startIndex, endIndex);
        
        const errorsList = document.getElementById('errorsList');
        errorsList.innerHTML = '';
        
        const categoryInfo = this.errorDB.getCategoryInfo(category);
        const categoryDisplayName = categoryInfo.name;
        document.getElementById('errorsTitle').innerHTML = `<i class="${categoryInfo.icon}"></i> ${subcategoryDisplayName}`;
        
        document.getElementById('errorsBreadcrumb').innerHTML = `
            <a href="/" data-breadcrumb-home><i class="fas fa-home"></i> Главная</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <a href="/category/${category}" data-breadcrumb-category>${categoryDisplayName}</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <span>${subcategoryDisplayName}</span>
        `;
        
        if (errorsToShow.length === 0) {
            errorsList.innerHTML = '<div class="no-results">В этой подкатегории пока нет ошибок</div>';
            document.getElementById('pagination').innerHTML = '';
            this.showSection('errors');
            return;
        }
        
        errorsToShow.forEach(error => {
            const errorItem = document.createElement('a');
            errorItem.className = 'error-item';
            errorItem.dataset.code = error.code;
            errorItem.href = `/error/${error.code}`;
            
            errorItem.innerHTML = `
                <div class="error-code">${error.code}</div>
                <div class="error-title">${error.title}</div>
                <div class="error-desc">${error.description.substring(0, 100)}${error.description.length > 100 ? '...' : ''}</div>
                <div class="error-meta">
                    <span><i class="${categoryInfo.icon}"></i> ${categoryDisplayName}</span>
                    <span class="urgency-${error.urgency}">${this.getUrgencyText(error.urgency)}</span>
                </div>
            `;
            
            errorItem.addEventListener('click', (e) => {
                e.preventDefault();
                this.showErrorDetail(error.code);
            });
            
            errorsList.appendChild(errorItem);
        });
        
        this.createPagination(errors.length);
        
        this.showSection('errors');
        this.updatePageTitle(`Ошибки ${subcategoryDisplayName} | ${categoryDisplayName} | ErrorFOXbase`);
        this.updateMetaDescription(`Список ошибок ${subcategoryDisplayName} в ${categoryDisplayName}. Поиск и решения распространенных проблем.`);
    }

    // ОСТАЛЬНЫЕ МЕТОДЫ БЕЗ ИЗМЕНЕНИЙ
    displayCategories() {
        const categoriesGrid = document.getElementById('categoriesGrid');
        categoriesGrid.innerHTML = '';

        for (const [categoryId, categoryInfo] of this.errorDB.categories) {
            const categoryCard = document.createElement('a');
            categoryCard.className = 'category-card';
            categoryCard.dataset.category = categoryId;
            categoryCard.href = `/category/${categoryId}`;
            
            const errorCount = this.errorDB.getErrorsByCategory(categoryId).length;
            const categoryDisplayName = categoryInfo.name;
            
            categoryCard.innerHTML = `
                <div class="category-icon"><i class="${categoryInfo.icon}"></i></div>
                <h3>${categoryDisplayName}</h3>
                <p>${errorCount} ошибок</p>
            `;
            
            categoryCard.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPageNumber = 1;
                this.displaySubcategories(categoryId);
            });
            
            categoriesGrid.appendChild(categoryCard);
        }

        this.showSection('categories');
        this.updatePageTitle('ErrorFOXbase - База знаний по ошибкам');
        this.updateMetaDescription('ErrorFOXbase - полная база знаний по ошибкам Windows, Linux, программ и сетей. Пошаговые решения с инструкциями для IT-специалистов и пользователей.');
    }

    displaySubcategories(category) {
        this.currentCategory = category;
        const categorySubcategories = this.errorDB.getSubcategories(category);
        
        const subcategoriesGrid = document.getElementById('subcategoriesGrid');
        subcategoriesGrid.innerHTML = '';
        
        const categoryInfo = this.errorDB.getCategoryInfo(category);
        const categoryDisplayName = categoryInfo.name;
        document.getElementById('categoryTitle').innerHTML = `<i class="${categoryInfo.icon}"></i> Ошибки ${categoryDisplayName}`;
        
        document.getElementById('breadcrumb').innerHTML = `
            <a href="/" data-breadcrumb-home><i class="fas fa-home"></i> Главная</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <span>${categoryDisplayName}</span>
        `;
        
        if (categorySubcategories.length === 0) {
            subcategoriesGrid.innerHTML = '<div class="no-results">Для этой категории пока нет подкатегорий</div>';
            this.showSection('subcategories');
            return;
        }
        
        categorySubcategories.forEach(subcategory => {
            const subcategoryCard = document.createElement('a');
            subcategoryCard.className = 'subcategory-card';
            subcategoryCard.dataset.subcategory = subcategory.id;
            subcategoryCard.href = `/category/${category}/${subcategory.id}`;
            
            const errorCount = this.countErrorsInSubcategory(category, subcategory.id);
            const subcategoryDisplayName = subcategory.name;
            
            subcategoryCard.innerHTML = `
                <div class="subcategory-icon"><i class="${subcategory.icon}"></i></div>
                <h3>${subcategoryDisplayName}</h3>
                <p>${errorCount} ошибок</p>
            `;
            
            subcategoryCard.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentSubcategory = subcategory.id;
                this.displayErrorsBySubcategory(category, subcategory.id);
            });
            
            subcategoriesGrid.appendChild(subcategoryCard);
        });
        
        this.showSection('subcategories');
        this.updatePageTitle(`Ошибки ${categoryDisplayName} | ErrorFOXbase`);
        this.updateMetaDescription(`Решения ошибок ${categoryDisplayName}. Пошаговые инструкции по устранению проблем в ${categoryDisplayName}.`);
    }

    getSubcategoryDisplayName(category, subcategoryId) {
        const categorySubcategories = this.errorDB.getSubcategories(category);
        const subcategory = categorySubcategories.find(s => s.id === subcategoryId);
        return subcategory ? subcategory.name : '';
    }

    createPagination(totalErrorsCount) {
        const totalPages = Math.ceil(totalErrorsCount / this.errorsPerPage);
        const pagination = document.getElementById('pagination');
        
        pagination.innerHTML = '';
        
        if (totalPages <= 1) return;
        
        const prevBtn = document.createElement('a');
        prevBtn.className = `page-btn ${this.currentPageNumber === 1 ? 'disabled' : ''}`;
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentPageNumber > 1) {
                this.currentPageNumber--;
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            }
        });
        pagination.appendChild(prevBtn);
        
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('a');
            pageBtn.className = `page-btn ${i === this.currentPageNumber ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.href = `?page=${i}`;
            pageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPageNumber = i;
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            });
            pagination.appendChild(pageBtn);
        }
        
        const nextBtn = document.createElement('a');
        nextBtn.className = `page-btn ${this.currentPageNumber === totalPages ? 'disabled' : ''}`;
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentPageNumber < totalPages) {
                this.currentPageNumber++;
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            }
        });
        pagination.appendChild(nextBtn);
    }

    showErrorDetail(errorCode) {
        const error = this.errorDB.getError(errorCode);
        if (!error) {
            this.showNoResults();
            return;
        }

        this.userPrefs.addToHistory(error);
        this.displayHistory();

        document.getElementById('errorDetailCode').textContent = error.code;
        
        const categoryInfo = this.errorDB.getCategoryInfo(error.category);
        const categoryDisplayName = categoryInfo.name;
        document.getElementById('errorDetailCategory').textContent = categoryDisplayName;
        
        document.getElementById('errorDetailTitle').textContent = error.title;
        document.getElementById('errorDetailDescription').textContent = error.description;
        document.getElementById('errorSystem').textContent = error.system;
        document.getElementById('errorUrgency').textContent = this.getUrgencyText(error.urgency);
        document.getElementById('errorUrgency').className = `urgency-${error.urgency}`;
        document.getElementById('errorFrequency').textContent = error.frequency;
        document.getElementById('errorLastUpdate').textContent = error.lastUpdate || "1 октября 2025";
        
        const solutionsContainer = document.getElementById('errorSolutions');
        solutionsContainer.innerHTML = '';
        
        if (error.solutions && error.solutions.length > 0) {
            error.solutions.forEach((solution, solutionIndex) => {
                const progressPercentage = ((solutionIndex + 1) / error.solutions.length) * 100;
                const feedbackCount = this.userPrefs.getFeedbackCount(errorCode, solutionIndex);
                const isLiked = this.userPrefs.isLiked(errorCode, solutionIndex);
                
                const solutionItem = document.createElement('div');
                solutionItem.className = 'solution-item';
                solutionItem.innerHTML = `
                    <div class="solution-header">
                        <span class="solution-level solution-level-${solution.level}">${this.getLevelText(solution.level)}</span>
                        <h5>${solution.title}</h5>
                        <div class="solution-meta">
                            <span><i class="fas fa-clock"></i> ${solution.time}</span>
                            <span><i class="fas fa-shield-alt"></i> Риск: ${this.getRiskText(solution.risk)}</span>
                            <span><i class="fas fa-user"></i> Для: ${this.getLevelText(solution.level)}</span>
                        </div>
                    </div>
                    <div class="solution-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressPercentage}%"></div>
                        </div>
                        <div class="progress-steps">
                            ${error.solutions.map((_, idx) => 
                                `<span class="step ${idx <= solutionIndex ? 'active' : ''}">${idx + 1}</span>`
                            ).join('')}
                        </div>
                    </div>
                    <ol class="solution-steps">
                        ${solution.steps.map((step, stepIndex) => 
                            `<li>${step}</li>`
                        ).join('')}
                    </ol>
                    <div class="solution-feedback">
                        <button class="feedback-btn ${isLiked ? 'liked' : ''}">
                            <i class="${isLiked ? 'fas' : 'far'} fa-thumbs-up"></i> Это решение помогло
                        </button>
                        <span class="feedback-count">${feedbackCount === 0 ? 'Пока нет оценок' : `Помогло: ${feedbackCount} ${feedbackCount === 1 ? 'человеку' : 'людям'}`}</span>
                    </div>
                `;
                
                const feedbackBtn = solutionItem.querySelector('.feedback-btn');
                feedbackBtn.addEventListener('click', () => {
                    this.handleFeedback(errorCode, solutionIndex, feedbackBtn);
                });
                
                solutionsContainer.appendChild(solutionItem);
            });
        } else {
            solutionsContainer.innerHTML = '<div class="no-results">Для этой ошибки пока нет решений</div>';
        }

        const subcategoryDisplayName = this.getSubcategoryDisplayName(error.category, this.currentSubcategory);
        
        document.getElementById('detailBreadcrumb').innerHTML = `
            <a href="/" data-breadcrumb-home><i class="fas fa-home"></i> Главная</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <a href="/category/${error.category}" data-breadcrumb-category>${categoryDisplayName}</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <a href="/category/${error.category}/${this.currentSubcategory}" data-breadcrumb-subcategory>${subcategoryDisplayName}</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <span>${error.code}</span>
        `;

        this.showSection('errorDetail');
        
        this.updatePageTitle(`Ошибка ${error.code}: ${error.title} | ErrorFOXbase`);
        this.updateMetaDescription(`Решение ошибки ${error.code}: ${error.title}. ${error.description.substring(0, 160)}...`);
        this.updateStructuredDataForError(error);

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    searchError() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) return;

        const results = this.errorDB.searchErrors(query);
        
        if (results.length > 0) {
            this.showErrorDetail(results[0].code);
        } else {
            this.showNoResults();
        }
        
        document.getElementById('searchSuggestions').style.display = 'none';
    }

    showSuggestions(query) {
        if (!query || query.length < 2) {
            document.getElementById('searchSuggestions').style.display = 'none';
            return;
        }

        const suggestions = this.errorDB.searchErrors(query);
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (suggestions.length > 0) {
            searchSuggestions.innerHTML = suggestions.slice(0, 8).map(error => {
                const categoryInfo = this.errorDB.getCategoryInfo(error.category);
                const categoryDisplayName = categoryInfo.name;
                
                const suggestionElement = document.createElement('div');
                suggestionElement.className = 'search-suggestion';
                suggestionElement.dataset.code = error.code;
                
                const codeElement = document.createElement('div');
                codeElement.className = 'suggestion-code';
                codeElement.textContent = error.code;
                
                const titleElement = document.createElement('div');
                titleElement.className = 'suggestion-title';
                titleElement.textContent = error.title;
                
                const categoryElement = document.createElement('span');
                categoryElement.className = 'suggestion-category';
                categoryElement.textContent = categoryDisplayName;
                
                const textContainer = document.createElement('div');
                textContainer.appendChild(codeElement);
                textContainer.appendChild(titleElement);
                
                suggestionElement.appendChild(textContainer);
                suggestionElement.appendChild(categoryElement);
                
                return suggestionElement.outerHTML;
            }).join('');
            
            searchSuggestions.querySelectorAll('.search-suggestion').forEach(suggestion => {
                suggestion.addEventListener('click', () => {
                    const code = suggestion.dataset.code;
                    document.getElementById('searchInput').value = code;
                    this.showErrorDetail(code);
                });
            });
            
            searchSuggestions.style.display = 'block';
        } else {
            searchSuggestions.innerHTML = '<div class="search-suggestion">Ничего не найдено</div>';
            searchSuggestions.style.display = 'block';
        }
    }

    updateStats() {
        document.getElementById('totalErrors').textContent = this.errorDB.getTotalErrorsCount().toLocaleString();
        document.getElementById('totalSolutions').textContent = this.errorDB.getTotalSolutionsCount().toLocaleString();
    }

    updateStructuredData() {
        // Базовая структурированная данных для сайта
    }

    updateStructuredDataForError(error) {
        const oldScript = document.getElementById('error-structured-data');
        if (oldScript) {
            oldScript.remove();
        }

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'error-structured-data';
        script.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": `Решение ошибки ${error.code}: ${error.title}`,
            "description": error.description,
            "datePublished": "2025-10-01",
            "author": {
                "@type": "Organization",
                "name": "ErrorFOXbase"
            },
            "publisher": {
                "@type": "Organization",
                "name": "ErrorFOXbase",
                "logo": {
                    "@type": "ImageObject",
                    "url": "https://errorfoxbase.ru/logo.png"
                }
            },
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": `https://errorfoxbase.ru/error/${error.code}`
            },
            "proficiencyLevel": "Beginner",
            "about": {
                "@type": "Thing",
                "name": "Computer Errors"
            }
        });
        document.head.appendChild(script);
    }

    updatePageTitle(title) {
        document.title = title;
        this.updateMetaTag('property', 'og:title', title);
        this.updateMetaTag('name', 'twitter:title', title);
    }

    updateMetaDescription(description) {
        this.updateMetaTag('name', 'description', description);
        this.updateMetaTag('property', 'og:description', description);
        this.updateMetaTag('name', 'twitter:description', description);
    }

    updateMetaTag(attrName, attrValue, content) {
        let tag = document.querySelector(`meta[${attrName}="${attrValue}"]`);
        if (!tag) {
            tag = document.createElement('meta');
            tag.setAttribute(attrName, attrValue);
            document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
    }

    showSection(sectionName) {
        this.errorDB.hideAllSections();

        if (sectionName === 'categories') {
            document.getElementById('statsSection').classList.remove('hidden');
        } else {
            document.getElementById('statsSection').classList.add('hidden');
        }

        switch(sectionName) {
            case 'categories':
                document.getElementById('categoriesSection').classList.remove('hidden');
                break;
            case 'subcategories':
                document.getElementById('subcategoriesSection').classList.remove('hidden');
                break;
            case 'errors':
                document.getElementById('errorsSection').classList.remove('hidden');
                break;
            case 'errorDetail':
                document.getElementById('errorDetailSection').classList.remove('hidden');
                break;
            case 'noResults':
                document.getElementById('noResults').classList.remove('hidden');
                break;
        }
    }

    showCategories() {
        this.currentPageNumber = 1;
        this.displayCategories();
    }

    showSubcategories() {
        this.displaySubcategories(this.currentCategory);
    }

    showErrorsList() {
        this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
    }

    showNoResults() {
        this.showSection('noResults');
        this.updatePageTitle('Ошибка не найдена | ErrorFOXbase');
        this.updateMetaDescription('Искомая ошибка не найдена в базе данных ErrorFOXbase. Попробуйте другой запрос или выберите из категорий.');
    }

    getUrgencyText(urgency) {
        const texts = {
            'low': 'Низкая',
            'medium': 'Средняя',
            'high': 'Высокая'
        };
        return texts[urgency] || 'Неизвестно';
    }

    getLevelText(level) {
        const levels = {
            'beginner': 'Начинающий',
            'intermediate': 'Опытный', 
            'advanced': 'Эксперт'
        };
        return levels[level] || level;
    }

    getRiskText(risk) {
        const risks = {
            'low': 'Низкий',
            'medium': 'Средний',
            'high': 'Высокий'
        };
        return risks[risk] || risk;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ErrorFOXbaseApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, function(err) {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
          }
