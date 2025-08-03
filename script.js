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
    // Navigation smooth scrolling
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
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

    // AI Assistant Modal functionality
    const aiModalTriggers = document.querySelectorAll('.cta-secondary, .cta-ai, #ai-assistant-btn');
    const aiModal = document.getElementById('ai-modal');
    const aiClose = document.querySelector('.ai-close');
    const aiInput = document.querySelector('.ai-input input');
    const aiSendBtn = document.querySelector('.ai-input button');
    const aiChat = document.querySelector('.ai-chat');

    // Open AI modal
    aiModalTriggers.forEach(trigger => {
        trigger.addEventListener('click', function(e) {
            e.preventDefault();
            openAIModal();
        });
    });

    // Close AI modal
    if (aiClose) {
        aiClose.addEventListener('click', closeAIModal);
    }

    // Close modal when clicking outside
    if (aiModal) {
        aiModal.addEventListener('click', function(e) {
            if (e.target === aiModal) {
                closeAIModal();
            }
        });
    }

    // Send message functionality
    if (aiSendBtn && aiInput) {
        aiSendBtn.addEventListener('click', sendAIMessage);
        aiInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendAIMessage();
            }
        });
    }

    function openAIModal() {
        if (aiModal) {
            aiModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            // Focus on input after a short delay
            setTimeout(() => {
                if (aiInput) aiInput.focus();
            }, 100);
        }
    }

    function closeAIModal() {
        if (aiModal) {
            aiModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    function sendAIMessage() {
        const message = aiInput.value.trim();
        if (!message) return;

        // Add user message to chat
        addMessageToChat(message, 'user');
        
        // Clear input
        aiInput.value = '';

        // Simulate AI response after a delay
        setTimeout(() => {
            const responses = {
                en: [
                    "I can help you learn more about our AI modules. Which specific module interests you?",
                    "AirControl helps with project monitoring and risk forecasting. Would you like to know more?",
                    "Our platform integrates all construction workflows. What's your biggest challenge?",
                    "AirLegal can review contracts automatically. Are you dealing with complex legal documents?",
                    "Let me connect you with a demo specialist to show you the platform in action!"
                ],
                ru: [
                    "Я могу помочь вам узнать больше о наших ИИ-модулях. Какой модуль вас интересует?",
                    "AirControl помогает с мониторингом проектов и прогнозированием рисков. Хотите узнать больше?",
                    "Наша платформа интегрирует все строительные процессы. Какой у вас главный вызов?",
                    "AirLegal может автоматически проверять контракты. Работаете со сложными юридическими документами?",
                    "Давайте свяжем вас со специалистом по демо, чтобы показать платформу в действии!"
                ]
            };
            const currentResponses = responses[currentLanguage] || responses.en;
            const randomResponse = currentResponses[Math.floor(Math.random() * currentResponses.length)];
            addMessageToChat(randomResponse, 'ai');
        }, 1000);
    }

    function addMessageToChat(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.className = sender === 'user' ? 'user-message' : 'ai-message';
        messageElement.innerHTML = `<p>${message}</p>`;
        
        if (aiChat) {
            aiChat.appendChild(messageElement);
            aiChat.scrollTop = aiChat.scrollHeight;
        }
    }

    // Module card interactions
    const moduleCards = document.querySelectorAll('.module-card');
    moduleCards.forEach(card => {
        card.addEventListener('click', function() {
            const moduleName = this.querySelector('.module-title').textContent;
            highlightModule(moduleName);
        });
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
            transform: translateX(400px);
            transition: transform 0.3s ease;
            max-width: 300px;
            font-size: 14px;
            font-weight: 500;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    // Demo button functionality
    const demoBtns = document.querySelectorAll('.demo-btn, .cta-primary');
    demoBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (!this.classList.contains('cta-secondary') && !this.classList.contains('cta-ai')) {
                e.preventDefault();
                showDemoForm();
            }
        });
    });

    function showDemoForm() {
        const messages = {
            en: 'Demo request feature coming soon! For now, please contact us directly.',
            ru: 'Функция запроса демо скоро появится! Пока свяжитесь с нами напрямую.'
        };
        showNotification(messages[currentLanguage] || messages.en);
    }

    // Scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animatedElements = document.querySelectorAll('.concept-card, .module-card, .goal-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Navbar scroll effect
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            navbar.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
        
        // Add shadow when scrolled
        if (scrollTop > 50) {
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.boxShadow = 'none';
        }
    });

    // Parallax effect for floating cards
    const floatingCards = document.querySelectorAll('.card-preview');
    
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallax = scrolled * 0.3;
        
        floatingCards.forEach((card, index) => {
            const direction = index % 2 === 0 ? 1 : -1;
            card.style.transform = `translateY(${parallax * direction}px)`;
        });
    });

    // Add loading animation
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    window.addEventListener('load', function() {
        document.body.style.opacity = '1';
    });
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
            transition: left 0.3s ease;
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
    
    .user-message {
        background-color: var(--primary-orange);
        color: white;
        padding: 12px 16px;
        border-radius: 12px;
        margin-bottom: 12px;
        margin-left: 20%;
        text-align: right;
    }
    
    .ai-message {
        background-color: var(--light-grey);
        padding: 12px 16px;
        border-radius: 12px;
        margin-bottom: 12px;
        margin-right: 20%;
    }
`;
document.head.appendChild(style);