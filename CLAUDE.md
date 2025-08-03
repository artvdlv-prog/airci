# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Airchitect is a bilingual (English/Russian) landing page for an AI-powered construction automation platform. The project is a high-fidelity interactive prototype built with vanilla HTML, CSS, and JavaScript following Apple-inspired design principles.

## Architecture and Structure

### Core Files
- `index.html` - Single-page application with semantic sections for intro, concept, goals, modules, and CTA
- `styles.css` - Apple-style CSS with CSS custom properties, responsive design, and smooth animations
- `script.js` - Interactive functionality including language switching, AI modal, smooth scrolling, and animations
- `translations.js` - Structured translation data for English and Russian content

### Design System
The project uses a consistent design language with:
- **Color scheme**: Dark grey (#1E1E1E) and orange (#FF6A00) as primary colors
- **Typography**: Apple system fonts with careful letter spacing and font weights
- **Spacing**: CSS custom properties for consistent margins, padding, and layout
- **Components**: Modular card-based design for features and modules

### Translation System
The bilingual functionality is built around:
- `data-translate` attributes on HTML elements referencing nested translation keys
- Dynamic content switching via `switchLanguage()` function
- Persistent language preference stored in localStorage
- Contextual translations for AI responses and notifications

### Interactive Features
- **Language switcher**: EN/RU toggle in navigation with persistent state
- **AI Assistant modal**: Simulated chatbot with language-appropriate responses
- **Smooth scrolling navigation**: Anchor-based navigation with smooth transitions
- **Responsive animations**: Intersection Observer for scroll-triggered animations
- **Module interactions**: Clickable module cards with notification system

## Key Sections

The page is structured in five main sections:
1. **Intro** - Hero section with floating animated cards and CTAs
2. **Concept** - Target audience grid (government, construction, equipment, legal)
3. **Goals** - Mission statement with animated integration diagram
4. **Modules** - Seven AI-powered modules with feature tags
5. **CTA** - Final call-to-action with demo request and AI assistant access

## Development Notes

### Adding New Translations
When adding translatable content:
1. Add `data-translate` attribute with dot-notation key to HTML elements
2. Add corresponding translations to both `en` and `ru` objects in `translations.js`
3. For placeholder text, use `data-translate-placeholder` attribute

### Styling Conventions
- Use CSS custom properties for colors and consistent values
- Follow mobile-first responsive approach with `min-width` media queries
- Maintain 4px grid system for spacing consistency
- Use `clamp()` for responsive typography scaling

### Interactive Components
- All interactive elements should support both languages
- Use smooth transitions (0.3s ease) for consistency
- Implement proper accessibility with focus states and semantic HTML
- Test animations on both desktop and mobile viewports

### AI Assistant Integration
The AI modal system includes:
- Language-aware responses based on `currentLanguage` variable
- Simulated typing delay for realistic chat experience
- Message history within modal session
- Proper modal accessibility (focus management, escape key, backdrop clicks)

## File Dependencies
- `index.html` loads `translations.js` before `script.js` for proper initialization
- All CSS is self-contained in `styles.css` with no external dependencies
- JavaScript uses vanilla DOM APIs with no framework dependencies