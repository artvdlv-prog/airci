// Module-specific functionality
let moduleCurrentLanguage = currentLanguage || 'en';

// Chat functionality
class ModuleChatInterface {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.chatSend = document.getElementById('chatSend');
        this.isTyping = false;
        
        this.bindEvents();
    }
    
    bindEvents() {
        if (this.chatSend) {
            this.chatSend.addEventListener('click', () => this.sendMessage());
        }
        
        if (this.chatInput) {
            this.chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    }
    
    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isTyping) return;
        
        this.addMessage(message, 'user');
        this.chatInput.value = '';
        
        // Simulate AI response after delay
        setTimeout(() => {
            this.simulateAIResponse(message);
        }, 1000);
    }
    
    addMessage(content, sender = 'assistant') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'user' ? '👤' : '🤖';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageText = document.createElement('p');
        messageText.textContent = content;
        messageContent.appendChild(messageText);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    simulateAIResponse(userMessage) {
        this.isTyping = true;
        this.chatSend.disabled = true;
        
        // Get module-specific response
        const response = this.generateResponse(userMessage);
        
        // Add typing indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant-message typing';
        typingDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <p>Typing...</p>
            </div>
        `;
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
        
        // Replace typing indicator with actual response
        setTimeout(() => {
            this.chatMessages.removeChild(typingDiv);
            this.addMessage(response);
            this.isTyping = false;
            this.chatSend.disabled = false;
        }, 2000);
    }
    
    generateResponse(userMessage) {
        const moduleName = document.querySelector('.module-title').textContent;
        const responses = {
            en: [
                `I understand you're asking about ${moduleName}. Let me help you with that specific functionality.`,
                `That's a great question about ${moduleName}. Here's what I can tell you about our capabilities in this area.`,
                `For ${moduleName}, we offer comprehensive solutions. Would you like me to explain any specific features?`,
                `I'm here to help you navigate ${moduleName}'s features. What specific aspect interests you most?`
            ],
            ru: [
                `Я понимаю, что вы спрашиваете о ${moduleName}. Позвольте мне помочь вам с этой конкретной функциональностью.`,
                `Это отличный вопрос о ${moduleName}. Вот что я могу рассказать о наших возможностях в этой области.`,
                `Для ${moduleName} мы предлагаем комплексные решения. Хотели бы вы, чтобы я объяснил какие-либо конкретные функции?`,
                `Я здесь, чтобы помочь вам разобраться в функциях ${moduleName}. Какой конкретный аспект вас больше всего интересует?`
            ]
        };
        
        const langResponses = responses[moduleCurrentLanguage] || responses.en;
        return langResponses[Math.floor(Math.random() * langResponses.length)];
    }
    
    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}

// Tab functionality
class TabManager {
    constructor() {
        this.tabs = document.querySelectorAll('.tab-button');
        this.panels = document.querySelectorAll('.subsection-panel');
        
        this.bindEvents();
        this.showTab(0); // Show first tab by default
    }
    
    bindEvents() {
        this.tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => this.showTab(index));
        });
    }
    
    showTab(index) {
        // Remove active class from all tabs and panels
        this.tabs.forEach(tab => tab.classList.remove('active'));
        this.panels.forEach(panel => panel.classList.remove('active'));
        
        // Add active class to selected tab and panel
        if (this.tabs[index]) {
            this.tabs[index].classList.add('active');
        }
        if (this.panels[index]) {
            this.panels[index].classList.add('active');
        }
    }
}

// Animation utilities
function animateOnScroll() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    document.querySelectorAll('.feature-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
}

// Language switching for module pages
function switchModuleLanguage(lang) {
    moduleCurrentLanguage = lang;
    
    // Update active language button
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });
    
    // Update translatable elements
    const elementsToTranslate = document.querySelectorAll('[data-translate]');
    elementsToTranslate.forEach(element => {
        const translationKey = element.dataset.translate;
        let translation = getNestedProperty(translations[lang], translationKey);
        
        // Try module-specific translations first
        if (!translation && window.moduleTranslations) {
            translation = getNestedProperty(moduleTranslations[lang], translationKey);
        }
        
        if (translation) {
            element.textContent = translation;
        }
    });
    
    // Update placeholders
    const placeholderElements = document.querySelectorAll('[data-translate-placeholder]');
    placeholderElements.forEach(element => {
        const translationKey = element.dataset.translatePlaceholder;
        let translation = getNestedProperty(translations[lang], translationKey);
        
        if (!translation && window.moduleTranslations) {
            translation = getNestedProperty(moduleTranslations[lang], translationKey);
        }
        
        if (translation) {
            element.placeholder = translation;
        }
    });
    
    // Save language preference
    localStorage.setItem('airchitect-language', lang);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Load saved language
    const savedLang = localStorage.getItem('airchitect-language');
    if (savedLang && (translations[savedLang] || (window.moduleTranslations && moduleTranslations[savedLang]))) {
        switchModuleLanguage(savedLang);
    }
    
    // Initialize chat interface
    new ModuleChatInterface();
    
    // Initialize tab manager
    new TabManager();
    
    // Initialize animations
    animateOnScroll();
    
    // Bind language switcher
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchModuleLanguage(btn.dataset.lang);
        });
    });
    
    // Mobile menu toggle (reuse from main script)
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
});