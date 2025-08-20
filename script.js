// Language functionality
let currentLanguage = 'en';

function switchLanguage(lang) {
    currentLanguage = lang;
    
    // Update active language button
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });
    
    // Update all translatable elements
    const elementsToTranslate = document.querySelectorAll('[data-translate]');
    elementsToTranslate.forEach(element => {
        const translationKey = element.dataset.translate;
        const translation = getNestedProperty(translations[lang], translationKey);
        if (translation) {
            element.textContent = translation;
        }
    });
    
    // Update placeholders
    const placeholderElements = document.querySelectorAll('[data-translate-placeholder]');
    placeholderElements.forEach(element => {
        const translationKey = element.dataset.translatePlaceholder;
        const translation = getNestedProperty(translations[lang], translationKey);
        if (translation) {
            element.placeholder = translation;
        }
    });
    
    // Save language preference
    localStorage.setItem('airchitect-language', lang);
}

function getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
}

function loadSavedLanguage() {
    const savedLang = localStorage.getItem('airchitect-language');
    if (savedLang && translations[savedLang]) {
        switchLanguage(savedLang);
    }
}

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Load saved language on page load
    loadSavedLanguage();
    
    // Language switcher functionality
    const languageButtons = document.querySelectorAll('.lang-btn');
    languageButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const lang = this.dataset.lang;
            switchLanguage(lang);
        });
    });
    // Navigation scrolling
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    block: 'start'
                });
            }
        });
    });

    // Mobile navigation toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });
    }


    // Module card interactions
    const moduleCards = document.querySelectorAll('.module-card');
    moduleCards.forEach(card => {
        card.addEventListener('click', function() {
            const moduleData = this.dataset.module;
            const moduleName = this.querySelector('.module-title').textContent;
            
            // Navigate to module page
            if (moduleData) {
                window.location.href = `modules/${moduleData}/index.html`;
            } else {
                highlightModule(moduleName);
            }
        });
        
        // Add cursor pointer style
        card.style.cursor = 'pointer';
    });

    function highlightModule(moduleName) {
        // Create a subtle notification
        showNotification(`Learn more about ${moduleName} - Request a demo to see it in action!`);
    }

    function showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: var(--primary-orange);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(255, 106, 0, 0.4);
            z-index: 1500;
            transform: translateX(0px);
            max-width: 300px;
            font-size: 14px;
            font-weight: 500;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        notification.style.transform = 'translateX(0)';
        
        // Remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    // Demo button functionality
    const demoBtns = document.querySelectorAll('.demo-btn, .cta-primary');
    demoBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            showDemoForm();
        });
    });

    function showDemoForm() {
        const messages = {
            en: 'Demo request feature coming soon! For now, please contact us directly.',
            ru: 'Функция запроса демо скоро появится! Пока свяжитесь с нами напрямую.'
        };
        showNotification(messages[currentLanguage] || messages.en);
    }




});

// CSS for mobile navigation
const style = document.createElement('style');
style.textContent = `
    @media (max-width: 768px) {
        .nav-menu {
            position: fixed;
            top: 72px;
            left: -100%;
            width: 100%;
            height: calc(100vh - 72px);
            background-color: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            flex-direction: column;
            justify-content: flex-start;
            align-items: center;
            padding-top: 50px;
        }
        
        .nav-menu.active {
            left: 0;
        }
        
        .nav-toggle.active span:nth-child(1) {
            transform: rotate(-45deg) translate(-5px, 6px);
        }
        
        .nav-toggle.active span:nth-child(2) {
            opacity: 0;
        }
        
        .nav-toggle.active span:nth-child(3) {
            transform: rotate(45deg) translate(-5px, -6px);
        }
    }
    
`;
document.head.appendChild(style);