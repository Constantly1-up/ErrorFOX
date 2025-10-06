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

// СЕРВИС АНАЛИТИКИ
class AnalyticsService {
    constructor() {
        this.enabled = !window.location.hostname.includes('localhost');
    }

    trackEvent(category, action, label) {
        if (!this.enabled) return;

        try {
            // Google Analytics 4
            if (typeof gtag !== 'undefined') {
                gtag('event', action, {
                    event_category: category,
                    event_label: label
                });
            }

            // Console log для разработки
            console.log(`Analytics: ${category} - ${action} - ${label}`);

            // Отправка на собственный сервер
            this.sendToServer({ category, action, label });
        } catch (error) {
            console.warn('Analytics error:', error);
        }
    }

    sendToServer(data) {
        if (!navigator.onLine) return;

        // В реальном приложении здесь был бы fetch на ваш сервер
        // fetch('/api/analytics', { method: 'POST', body: JSON.stringify(data) })
        console.log('Analytics data:', data);
    }
}

// ErrorFOXbase - Полная реализация с улучшениями
class ErrorFOXbaseApp {
    constructor() {
        this.currentPage = 'categories';
        this.currentCategory = '';
        this.currentSubcategory = '';
        this.currentPageNumber = 1;
        this.errorsPerPage = 6;
        this.searchTimeout = null;
        
        this.errorDB = new ErrorDatabaseService();
        this.userPrefs = new UserPreferences();
        this.toast = new ToastManager();
        this.analytics = new AnalyticsService();
        
        this.initializeApp();
    }

    async initializeApp() {
        try {
            this.applyTheme(this.userPrefs.getTheme());
            this.setupMobileEnhancements();
            this.setupGlobalErrorHandling();
            
            const success = await this.errorDB.initialize();
            
            if (success) {
                this.setupEventListeners();
                this.displayCategories();
                this.updateStats();
                this.updateStructuredData();
                this.displayHistory();
                this.analytics.trackEvent('app', 'init', 'success');
            } else {
                throw new Error('Database initialization failed');
            }
        } catch (error) {
            console.error('App initialization error:', error);
            this.analytics.trackEvent('app', 'init', 'error');
            this.toast.show('Не удалось запустить приложение', 'error');
        }
    }

    // 1. БЕЗОПАСНОСТЬ - Функции санитизации
    sanitizeHTML(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    validateInput(input, type = 'text') {
        const validators = {
            text: (val) => typeof val === 'string' && val.length > 0 && val.length < 500,
            code: (val) => /^[a-zA-Z0-9\-_\. ]{1,50}$/.test(val),
            search: (val) => typeof val === 'string' && val.length < 100
        };
        return validators[type] ? validators[type](input) : false;
    }

    // 2. PWA И ОФФЛАЙН РАБОТА
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('SW registered: ', registration);
                    this.analytics.trackEvent('pwa', 'sw_registered', 'success');
                })
                .catch(error => {
                    console.log('SW registration failed: ', error);
                    this.analytics.trackEvent('pwa', 'sw_registered', 'error');
                });
        }
    }

    setupAppInstallPrompt() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            const installButton = document.createElement('button');
            installButton.className = 'install-btn';
            installButton.innerHTML = '<i class="fas fa-download"></i> Установить приложение';
            installButton.addEventListener('click', () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    this.analytics.trackEvent('pwa', 'install', choiceResult.outcome);
                    deferredPrompt = null;
                });
            });
            
            // Добавляем кнопку в header actions если есть место
            const headerActions = document.getElementById('headerActions');
            if (headerActions) {
                headerActions.appendChild(installButton);
            }
        });
    }

    // 3. ПРОИЗВОДИТЕЛЬНОСТЬ - Debounce и оптимизации
    debounce(func, wait, immediate) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // 4. ДОСТУПНОСТЬ (a11y)
    setupAccessibility() {
        // Динамические ARIA-атрибуты
        this.updateLiveRegion('Приложение загружено');
        
        // Клавиатурная навигация
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModals();
            }
            
            if (e.key === 'Tab') {
                this.handleTabNavigation(e);
            }
        });
    }

    updateLiveRegion(message) {
        let liveRegion = document.getElementById('liveRegion');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'liveRegion';
            liveRegion.className = 'sr-only';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            document.body.appendChild(liveRegion);
        }
        liveRegion.textContent = message;
    }

    handleTabNavigation(e) {
        const focusableElements = document.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    }

    closeModals() {
        this.closeHistory();
        document.getElementById('searchSuggestions').style.display = 'none';
    }

    // 5. МОБИЛЬНЫЕ УЛУЧШЕНИЯ
    setupMobileEnhancements() {
        // Предотвращение двойного тапа для масштабирования
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });

        // Улучшение скролла на iOS
        this.updateViewportHeight();
        window.addEventListener('resize', this.throttle(() => {
            this.updateViewportHeight();
        }, 250));

        // Закрытие клавиатуры при скролле на мобильных
        if ('ontouchstart' in window) {
            document.addEventListener('scroll', this.throttle(() => {
                document.activeElement?.blur();
            }, 100));
        }

        // Обработка изменения ориентации
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.updateViewportHeight(), 300);
        });
    }

    updateViewportHeight() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }

    // 6. ОБРАБОТКА ОШИБОК
    setupGlobalErrorHandling() {
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.analytics.trackEvent('error', 'global', e.error?.message || 'Unknown');
            this.toast.show('Произошла непредвиденная ошибка', 'error');
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.analytics.trackEvent('error', 'promise', e.reason?.message || 'Unknown');
            this.toast.show('Ошибка выполнения операции', 'error');
            e.preventDefault();
        });
    }

    // 7. ОСНОВНЫЕ СЛУШАТЕЛИ СОБЫТИЙ
    setupEventListeners() {
        // Поиск с debounce
        const debouncedSearch = this.debounce((value) => {
            this.showSuggestions(value);
        }, 300);

        document.getElementById('searchInput').addEventListener('input', (e) => {
            const value = e.target.value;
            
            if (!this.validateInput(value, 'search')) {
                document.getElementById('searchSuggestions').style.display = 'none';
                return;
            }

            debouncedSearch(value);
            this.updateSearchUI(value);
        });

        document.getElementById('searchBtn').addEventListener('click', () => this.searchError());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchError();
            }
        });

        // Навигация
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

        // Действия с ошибками
        document.getElementById('copyErrorCode').addEventListener('click', () => this.copyErrorCode());
        document.getElementById('shareError').addEventListener('click', () => this.shareError());

        // Настройки
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('historyBtn').addEventListener('click', () => this.toggleHistory());
        document.getElementById('closeHistory').addEventListener('click', () => this.closeHistory());
        document.getElementById('overlay').addEventListener('click', () => this.closeHistory());

        // Breadcrumbs
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

        // Закрытие выпадающих списков при клике вне
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) {
                document.getElementById('searchSuggestions').style.display = 'none';
            }
        });

        // Service Worker и PWA
        this.setupServiceWorker();
        this.setupAppInstallPrompt();
        
        // Доступность
        this.setupAccessibility();
    }

    updateSearchUI(value) {
        const searchContainer = document.getElementById('searchContainer');
        const searchBtn = document.getElementById('searchBtn');
        const searchText = document.querySelector('.search-text');

        if (value === '') {
            searchContainer.classList.remove('focused');
            searchBtn.classList.remove('compact');
            if (searchText) searchText.style.display = 'inline';
        } else {
            searchContainer.classList.add('focused');
            searchBtn.classList.add('compact');
            if (searchText) searchText.style.display = 'none';
        }
    }

    // 8. УПРАВЛЕНИЕ ТЕМОЙ
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        this.analytics.trackEvent('ui', 'theme_toggle', newTheme);
    }

    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        this.userPrefs.setTheme(theme);
        
        const themeIcon = document.querySelector('#themeToggle i');
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun';
            this.updateLiveRegion('Темная тема включена');
        } else {
            themeIcon.className = 'fas fa-moon';
            this.updateLiveRegion('Светлая тема включена');
        }
    }

    // 9. ИСТОРИЯ ПОСЕЩЕНИЙ
    toggleHistory() {
        const historyPanel = document.getElementById('historyPanel');
        const overlay = document.getElementById('overlay');
        
        historyPanel.classList.toggle('active');
        overlay.classList.toggle('active');
        
        if (historyPanel.classList.contains('active')) {
            this.displayHistory();
            this.updateLiveRegion('Открыта панель истории');
            this.analytics.trackEvent('ui', 'history_open', 'success');
        } else {
            this.updateLiveRegion('Закрыта панель истории');
        }
    }

    closeHistory() {
        document.getElementById('historyPanel').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        this.updateLiveRegion('Панель истории закрыта');
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
                <div class="history-item" data-code="${this.sanitizeHTML(item.code)}" tabindex="0" role="button" aria-label="Открыть ошибку ${this.sanitizeHTML(item.code)}">
                    <div class="history-code">${this.sanitizeHTML(item.code)}</div>
                    <div class="history-title">${this.sanitizeHTML(item.title)}</div>
                    <small style="color: var(--secondary); margin-top: 4px;">${this.sanitizeHTML(categoryName)}</small>
                </div>
            `;
        }).join('');
        
        historyList.querySelectorAll('.history-item').forEach(item => {
            const handleActivation = () => {
                const code = item.dataset.code;
                if (this.validateInput(code, 'code')) {
                    this.showErrorDetail(code);
                    this.closeHistory();
                }
            };
            
            item.addEventListener('click', handleActivation);
            item.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActivation();
                }
            });
        });
    }

    // 10. ОСНОВНЫЕ ФУНКЦИИ ПРИЛОЖЕНИЯ
    displayCategories() {
        const categoriesGrid = document.getElementById('categoriesGrid');
        categoriesGrid.innerHTML = '';

        for (const [categoryId, categoryInfo] of this.errorDB.categories) {
            const errorCount = this.errorDB.getErrorsByCategory(categoryId).length;
            const categoryDisplayName = categoryInfo.name;
            
            const categoryCard = document.createElement('a');
            categoryCard.className = 'category-card';
            categoryCard.dataset.category = categoryId;
            categoryCard.href = `/category/${categoryId}`;
            categoryCard.setAttribute('aria-label', `Категория ${categoryDisplayName}, ${errorCount} ошибок`);
            
            categoryCard.innerHTML = `
                <div class="category-icon"><i class="${this.sanitizeHTML(categoryInfo.icon)}"></i></div>
                <h3>${this.sanitizeHTML(categoryDisplayName)}</h3>
                <p>${errorCount} ошибок</p>
            `;
            
            categoryCard.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPageNumber = 1;
                this.analytics.trackEvent('navigation', 'category_select', categoryId);
                this.displaySubcategories(categoryId);
            });
            
            categoriesGrid.appendChild(categoryCard);
        }

        this.showSection('categories');
        this.updatePageTitle('ErrorFOXbase - База знаний по ошибкам');
        this.updateMetaDescription('ErrorFOXbase - полная база знаний по ошибкам Windows, Linux, программ и сетей. Пошаговые решения с инструкциями для IT-специалистов и пользователей.');
        this.updateLiveRegion('Загружены категории ошибок');
    }

    displaySubcategories(category) {
        if (!this.validateInput(category, 'text')) {
            this.showCategories();
            return;
        }

        this.currentCategory = category;
        const categorySubcategories = this.errorDB.getSubcategories(category);
        
        const subcategoriesGrid = document.getElementById('subcategoriesGrid');
        subcategoriesGrid.innerHTML = '';
        
        const categoryInfo = this.errorDB.getCategoryInfo(category);
        if (!categoryInfo) {
            this.showCategories();
            return;
        }
        
        const categoryDisplayName = categoryInfo.name;
        document.getElementById('categoryTitle').innerHTML = `<i class="${this.sanitizeHTML(categoryInfo.icon)}"></i> Ошибки ${this.sanitizeHTML(categoryDisplayName)}`;
        
        document.getElementById('breadcrumb').innerHTML = `
            <a href="/" data-breadcrumb-home><i class="fas fa-home"></i> Главная</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <span>${this.sanitizeHTML(categoryDisplayName)}</span>
        `;
        
        if (!categorySubcategories || categorySubcategories.length === 0) {
            subcategoriesGrid.innerHTML = '<div class="no-results">Для этой категории пока нет подкатегорий</div>';
            this.showSection('subcategories');
            return;
        }
        
        categorySubcategories.forEach(subcategory => {
            const errorCount = this.countErrorsInSubcategory(category, subcategory.id);
            const subcategoryDisplayName = subcategory.name;
            
            const subcategoryCard = document.createElement('a');
            subcategoryCard.className = 'subcategory-card';
            subcategoryCard.dataset.subcategory = subcategory.id;
            subcategoryCard.href = `/category/${category}/${subcategory.id}`;
            subcategoryCard.setAttribute('aria-label', `Подкатегория ${subcategoryDisplayName}, ${errorCount} ошибок`);
            
            subcategoryCard.innerHTML = `
                <div class="subcategory-icon"><i class="${this.sanitizeHTML(subcategory.icon)}"></i></div>
                <h3>${this.sanitizeHTML(subcategoryDisplayName)}</h3>
                <p>${errorCount} ошибок</p>
            `;
            
            subcategoryCard.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentSubcategory = subcategory.id;
                this.analytics.trackEvent('navigation', 'subcategory_select', `${category}/${subcategory.id}`);
                this.displayErrorsBySubcategory(category, subcategory.id);
            });
            
            subcategoriesGrid.appendChild(subcategoryCard);
        });
        
        this.showSection('subcategories');
        this.updatePageTitle(`Ошибки ${categoryDisplayName} | ErrorFOXbase`);
        this.updateMetaDescription(`Решения ошибок ${categoryDisplayName}. Пошаговые инструкции по устранению проблем в ${categoryDisplayName}.`);
        this.updateLiveRegion(`Загружены подкатегории для ${categoryDisplayName}`);
    }

    displayErrorsBySubcategory(category, subcategoryId) {
        if (!this.validateInput(category, 'text') || !this.validateInput(subcategoryId, 'text')) {
            this.showSubcategories();
            return;
        }

        const subcategoryDisplayName = this.getSubcategoryDisplayName(category, subcategoryId);
        let errors = this.errorDB.getErrorsBySubcategory(category, subcategoryDisplayName);
        
        // Универсальный поиск если не найдено
        if (errors.length === 0) {
            const allCategoryErrors = this.errorDB.getErrorsByCategory(category);
            errors = allCategoryErrors.filter(error => {
                if (!error.subcategory) return false;
                const errorSub = error.subcategory.toLowerCase();
                const subName = subcategoryDisplayName.toLowerCase();
                return errorSub.includes(subName) || subName.includes(errorSub);
            });
        }
        
        const startIndex = (this.currentPageNumber - 1) * this.errorsPerPage;
        const endIndex = startIndex + this.errorsPerPage;
        const errorsToShow = errors.slice(startIndex, endIndex);
        
        const errorsList = document.getElementById('errorsList');
        errorsList.innerHTML = '';
        
        const categoryInfo = this.errorDB.getCategoryInfo(category);
        if (!categoryInfo) {
            this.showSubcategories();
            return;
        }
        
        const categoryDisplayName = categoryInfo.name;
        document.getElementById('errorsTitle').innerHTML = `<i class="${this.sanitizeHTML(categoryInfo.icon)}"></i> ${this.sanitizeHTML(subcategoryDisplayName)}`;
        
        document.getElementById('errorsBreadcrumb').innerHTML = `
            <a href="/" data-breadcrumb-home><i class="fas fa-home"></i> Главная</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <a href="/category/${this.sanitizeHTML(category)}" data-breadcrumb-category>${this.sanitizeHTML(categoryDisplayName)}</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <span>${this.sanitizeHTML(subcategoryDisplayName)}</span>
        `;
        
        if (errorsToShow.length === 0) {
            errorsList.innerHTML = '<div class="no-results">В этой подкатегории пока нет ошибок</div>';
            document.getElementById('pagination').innerHTML = '';
            this.showSection('errors');
            return;
        }
        
        errorsToShow.forEach(error => {
            if (!this.validateErrorData(error)) {
                console.warn('Invalid error data:', error);
                return;
            }

            const errorItem = document.createElement('a');
            errorItem.className = 'error-item';
            errorItem.dataset.code = error.code;
            errorItem.href = `/error/${error.code}`;
            errorItem.setAttribute('aria-label', `Ошибка ${error.code}: ${error.title}`);
            
            errorItem.innerHTML = `
                <div class="error-code">${this.sanitizeHTML(error.code)}</div>
                <div class="error-title">${this.sanitizeHTML(error.title)}</div>
                <div class="error-desc">${this.sanitizeHTML(error.description.substring(0, 100))}${error.description.length > 100 ? '...' : ''}</div>
                <div class="error-meta">
                    <span><i class="${this.sanitizeHTML(categoryInfo.icon)}"></i> ${this.sanitizeHTML(categoryDisplayName)}</span>
                    <span class="urgency-${error.urgency}">${this.getUrgencyText(error.urgency)}</span>
                </div>
            `;
            
            errorItem.addEventListener('click', (e) => {
                e.preventDefault();
                this.analytics.trackEvent('navigation', 'error_select', error.code);
                this.showErrorDetail(error.code);
            });
            
            errorsList.appendChild(errorItem);
        });
        
        this.createPagination(errors.length);
        this.showSection('errors');
        this.updatePageTitle(`Ошибки ${subcategoryDisplayName} | ${categoryDisplayName} | ErrorFOXbase`);
        this.updateMetaDescription(`Список ошибок ${subcategoryDisplayName} в ${categoryDisplayName}. Поиск и решения распространенных проблем.`);
        this.updateLiveRegion(`Загружены ошибки подкатегории ${subcategoryDisplayName}`);
    }

    showErrorDetail(errorCode) {
        if (!this.validateInput(errorCode, 'code')) {
            this.showNoResults();
            return;
        }

        const error = this.errorDB.getError(errorCode);
        if (!error || !this.validateErrorData(error)) {
            this.showNoResults();
            return;
        }

        this.userPrefs.addToHistory(error);
        this.displayHistory();
        this.analytics.trackEvent('error', 'view', errorCode);

        // Безопасное обновление DOM
        document.getElementById('errorDetailCode').textContent = this.sanitizeHTML(error.code);
        
        const categoryInfo = this.errorDB.getCategoryInfo(error.category);
        const categoryDisplayName = categoryInfo ? categoryInfo.name : error.category;
        document.getElementById('errorDetailCategory').textContent = this.sanitizeHTML(categoryDisplayName);
        
        document.getElementById('errorDetailTitle').textContent = this.sanitizeHTML(error.title);
        document.getElementById('errorDetailDescription').textContent = this.sanitizeHTML(error.description);
        document.getElementById('errorSystem').textContent = this.sanitizeHTML(error.system);
        document.getElementById('errorUrgency').textContent = this.getUrgencyText(error.urgency);
        document.getElementById('errorUrgency').className = `urgency-${error.urgency}`;
        document.getElementById('errorFrequency').textContent = this.sanitizeHTML(error.frequency);
        document.getElementById('errorLastUpdate').textContent = error.lastUpdate || "1 октября 2025";
        
        const solutionsContainer = document.getElementById('errorSolutions');
        solutionsContainer.innerHTML = '';
        
        if (error.solutions && error.solutions.length > 0) {
            error.solutions.forEach((solution, solutionIndex) => {
                if (!this.validateSolutionData(solution)) {
                    console.warn('Invalid solution data:', solution);
                    return;
                }

                const progressPercentage = ((solutionIndex + 1) / error.solutions.length) * 100;
                const feedbackCount = this.userPrefs.getFeedbackCount(errorCode, solutionIndex);
                const isLiked = this.userPrefs.isLiked(errorCode, solutionIndex);
                
                const solutionItem = document.createElement('div');
                solutionItem.className = 'solution-item';
                solutionItem.innerHTML = `
                    <div class="solution-header">
                        <span class="solution-level solution-level-${solution.level}">${this.getLevelText(solution.level)}</span>
                        <h5>${this.sanitizeHTML(solution.title)}</h5>
                        <div class="solution-meta">
                            <span><i class="fas fa-clock"></i> ${this.sanitizeHTML(solution.time)}</span>
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
                            `<li>${this.sanitizeHTML(step)}</li>`
                        ).join('')}
                    </ol>
                    <div class="solution-feedback">
                        <button class="feedback-btn ${isLiked ? 'liked' : ''}" 
                                aria-label="${isLiked ? 'Убрать лайк' : 'Отметить как полезное'}">
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
            <a href="/category/${this.sanitizeHTML(error.category)}" data-breadcrumb-category>${this.sanitizeHTML(categoryDisplayName)}</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <a href="/category/${this.sanitizeHTML(error.category)}/${this.sanitizeHTML(this.currentSubcategory)}" data-breadcrumb-subcategory>${this.sanitizeHTML(subcategoryDisplayName)}</a>
            <span class="separator"><i class="fas fa-chevron-right"></i></span>
            <span>${this.sanitizeHTML(error.code)}</span>
        `;

        this.showSection('errorDetail');
        this.updatePageTitle(`Ошибка ${error.code}: ${error.title} | ErrorFOXbase`);
        this.updateMetaDescription(`Решение ошибки ${error.code}: ${error.title}. ${error.description.substring(0, 160)}...`);
        this.updateStructuredDataForError(error);
        this.updateLiveRegion(`Загружена информация об ошибке ${error.code}`);

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 11. ПОИСК И САДЖЕСТЫ
    searchError() {
        const query = document.getElementById('searchInput').value.trim();
        
        if (!this.validateInput(query, 'search')) {
            this.toast.show('Введите корректный запрос для поиска', 'error');
            return;
        }

        this.analytics.trackEvent('search', 'perform', query);
        const results = this.errorDB.searchErrors(query);
        
        if (results.length > 0) {
            this.showErrorDetail(results[0].code);
        } else {
            this.showNoResults();
            this.analytics.trackEvent('search', 'no_results', query);
        }
        
        document.getElementById('searchSuggestions').style.display = 'none';
    }

    showSuggestions(query) {
        if (!this.validateInput(query, 'search') || query.length < 2) {
            document.getElementById('searchSuggestions').style.display = 'none';
            return;
        }

        const suggestions = this.errorDB.searchErrors(query);
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (suggestions.length > 0) {
            searchSuggestions.innerHTML = suggestions.slice(0, 8).map(error => {
                const categoryInfo = this.errorDB.getCategoryInfo(error.category);
                const categoryDisplayName = categoryInfo ? categoryInfo.name : error.category;
                
                return `
                    <div class="search-suggestion" data-code="${this.sanitizeHTML(error.code)}" role="button" tabindex="0">
                        <div>
                            <div class="suggestion-code">${this.sanitizeHTML(error.code)}</div>
                            <div class="suggestion-title">${this.sanitizeHTML(error.title)}</div>
                        </div>
                        <span class="suggestion-category">${this.sanitizeHTML(categoryDisplayName)}</span>
                    </div>
                `;
            }).join('');
            
            searchSuggestions.querySelectorAll('.search-suggestion').forEach(suggestion => {
                const handleActivation = () => {
                    const code = suggestion.dataset.code;
                    if (this.validateInput(code, 'code')) {
                        document.getElementById('searchInput').value = code;
                        this.analytics.trackEvent('search', 'suggestion_select', code);
                        this.showErrorDetail(code);
                    }
                };
                
                suggestion.addEventListener('click', handleActivation);
                suggestion.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleActivation();
                    }
                });
            });
            
            searchSuggestions.style.display = 'block';
        } else {
            searchSuggestions.innerHTML = '<div class="search-suggestion">Ничего не найдено</div>';
            searchSuggestions.style.display = 'block';
        }
    }

    // 12. ВАЛИДАЦИЯ ДАННЫХ
    validateErrorData(error) {
        return error && 
               this.validateInput(error.code, 'code') &&
               this.validateInput(error.title, 'text') &&
               this.validateInput(error.description, 'text') &&
               this.validateInput(error.category, 'text');
    }

    validateSolutionData(solution) {
        return solution &&
               this.validateInput(solution.title, 'text') &&
               Array.isArray(solution.steps) &&
               solution.steps.every(step => this.validateInput(step, 'text'));
    }

    // 13. ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    countErrorsInSubcategory(category, subcategoryId) {
        const categorySubcategories = this.errorDB.getSubcategories(category);
        const subcategory = categorySubcategories.find(s => s.id === subcategoryId);
        
        if (!subcategory) return 0;
        
        const subcategoryName = subcategory.name;
        let errors = this.errorDB.getErrorsBySubcategory(category, subcategoryName);
        
        if (errors.length === 0) {
            const allCategoryErrors = this.errorDB.getErrorsByCategory(category);
            errors = allCategoryErrors.filter(error => {
                if (!error.subcategory) return false;
                const errorSub = error.subcategory.toLowerCase();
                const subName = subcategoryName.toLowerCase();
                return errorSub.includes(subName) || subName.includes(errorSub);
            });
        }
        
        return errors.length;
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
        
        // Кнопка "Назад"
        const prevBtn = document.createElement('a');
        prevBtn.className = `page-btn ${this.currentPageNumber === 1 ? 'disabled' : ''}`;
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.setAttribute('aria-label', 'Предыдущая страница');
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentPageNumber > 1) {
                this.currentPageNumber--;
                this.analytics.trackEvent('pagination', 'prev', this.currentPageNumber.toString());
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            }
        });
        pagination.appendChild(prevBtn);
        
        // Номера страниц
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('a');
            pageBtn.className = `page-btn ${i === this.currentPageNumber ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.href = `?page=${i}`;
            pageBtn.setAttribute('aria-label', `Страница ${i}`);
            pageBtn.setAttribute('aria-current', i === this.currentPageNumber ? 'page' : 'false');
            
            pageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPageNumber = i;
                this.analytics.trackEvent('pagination', 'page_select', i.toString());
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            });
            pagination.appendChild(pageBtn);
        }
        
        // Кнопка "Вперед"
        const nextBtn = document.createElement('a');
        nextBtn.className = `page-btn ${this.currentPageNumber === totalPages ? 'disabled' : ''}`;
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.setAttribute('aria-label', 'Следующая страница');
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentPageNumber < totalPages) {
                this.currentPageNumber++;
                this.analytics.trackEvent('pagination', 'next', this.currentPageNumber.toString());
                this.displayErrorsBySubcategory(this.currentCategory, this.currentSubcategory);
            }
        });
        pagination.appendChild(nextBtn);
    }

    handleFeedback(errorCode, solutionIndex, button) {
        const isNowLiked = this.userPrefs.toggleLike(errorCode, solutionIndex);
        const count = this.userPrefs.getFeedbackCount(errorCode, solutionIndex);
        
        if (isNowLiked) {
            button.classList.add('liked');
            button.innerHTML = '<i class="fas fa-thumbs-up"></i> Это решение помогло';
            button.setAttribute('aria-label', 'Убрать лайк');
            this.toast.show('Спасибо за ваш отзыв!', 'success');
            this.analytics.trackEvent('feedback', 'like', `${errorCode}-${solutionIndex}`);
        } else {
            button.classList.remove('liked');
            button.innerHTML = '<i class="far fa-thumbs-up"></i> Это решение помогло';
            button.setAttribute('aria-label', 'Отметить как полезное');
            this.toast.show('Лайк удален', 'success');
            this.analytics.trackEvent('feedback', 'unlike', `${errorCode}-${solutionIndex}`);
        }
        
        this.updateFeedbackText(button.parentNode.querySelector('.feedback-count'), count);
    }

    updateFeedbackText(element, count) {
        const peopleText = count === 1 ? 'человеку' : 'людям';
        element.textContent = count === 0 ? 'Пока нет оценок' : `Помогло: ${count} ${peopleText}`;
    }

    copyErrorCode() {
        const code = document.getElementById('errorDetailCode').textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.toast.show('Код ошибки скопирован', 'success');
            this.analytics.trackEvent('action', 'copy_code', code);
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
            navigator.share(shareData)
                .then(() => this.analytics.trackEvent('action', 'share_native', code))
                .catch(() => this.fallbackShare(code, url));
        } else {
            this.fallbackShare(code, url);
        }
    }

    fallbackShare(code, url) {
        navigator.clipboard.writeText(`${url} - Ошибка ${code}`).then(() => {
            this.toast.show('Ссылка скопирована в буфер', 'success');
            this.analytics.trackEvent('action', 'share_fallback', code);
        }).catch(() => {
            this.toast.show('Не удалось поделиться', 'error');
        });
    }

    // 14. SEO И МЕТА-ДАННЫЕ
    updateStats() {
        document.getElementById('totalErrors').textContent = this.errorDB.getTotalErrorsCount().toLocaleString();
        document.getElementById('totalSolutions').textContent = this.errorDB.getTotalSolutionsCount().toLocaleString();
    }

    updateStructuredData() {
        // Базовая структурированная данных для сайта
    }

    updateStructuredDataForError(error) {
        const oldScript = document.getElementById('error-structured-data');
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'error-structured-data';
        script.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": `Решение ошибки ${error.code}: ${error.title}`,
            "description": error.description,
            "datePublished": "2025-10-01",
            "author": { "@type": "Organization", "name": "ErrorFOXbase" },
            "publisher": {
                "@type": "Organization",
                "name": "ErrorFOXbase",
                "logo": { "@type": "ImageObject", "url": "https://errorfoxbase.ru/logo.png" }
            },
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": `https://errorfoxbase.ru/error/${error.code}`
            },
            "proficiencyLevel": "Beginner",
            "about": { "@type": "Thing", "name": "Computer Errors" }
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

    // 15. УПРАВЛЕНИЕ СЕКЦИЯМИ
    showSection(sectionName) {
        this.errorDB.hideAllSections();

        if (sectionName === 'categories') {
            document.getElementById('statsSection').classList.remove('hidden');
        } else {
            document.getElementById('statsSection').classList.add('hidden');
        }

        const sections = {
            'categories': 'categoriesSection',
            'subcategories': 'subcategoriesSection', 
            'errors': 'errorsSection',
            'errorDetail': 'errorDetailSection',
            'noResults': 'noResults'
        };

        const sectionId = sections[sectionName];
        if (sectionId) {
            document.getElementById(sectionId).classList.remove('hidden');
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
        this.updateLiveRegion('Ошибка не найдена');
    }

    // 16. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    getUrgencyText(urgency) {
        const texts = { 'low': 'Низкая', 'medium': 'Средняя', 'high': 'Высокая' };
        return texts[urgency] || 'Неизвестно';
    }

    getLevelText(level) {
        const levels = { 'beginner': 'Начинающий', 'intermediate': 'Опытный', 'advanced': 'Эксперт' };
        return levels[level] || level;
    }

    getRiskText(risk) {
        const risks = { 'low': 'Низкий', 'medium': 'Средний', 'high': 'Высокий' };
        return risks[risk] || risk;
    }
}

// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
document.addEventListener('DOMContentLoaded', () => {
    // Проверка поддержки современных возможностей
    if (!('Promise' in window) || !('fetch' in window)) {
        document.body.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Ваш браузер устарел</h2>
                <p>Для работы ErrorFOXbase требуется современный браузер</p>
                <p>Пожалуйста, обновите браузер или используйте другой</p>
            </div>
        `;
        return;
    }

    // Запуск приложения
    new ErrorFOXbaseApp();
});

// Service Worker для оффлайн работы
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registered: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
            }
