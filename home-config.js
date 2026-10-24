// Home page configuration: routes and specialists.
// Loaded before script.js on index.html.

// Routes used by home page buttons (elements with data-route="key").
// null = destination is not implemented yet: the button stays visible and
// shows a "section in preparation" notice instead of leading to a fake page.
const HOME_ROUTES = {
    cabinet: 'cabinet.html', // Personal cabinet (open access, data in the browser)
    staff: 'staff.html',    // "Штат": specialists' workspace (open access for now)
    specialist: 'staff.html?id={slug}', // Specialist's tab in "Штат"
    office: 'office.html',
    docs: 'docs.html',
    complex: 'complex.html',
    howItWorks: 'office.html#how',
    contractSupport: 'complex.html#contract-support',
    regulatory: 'aircodex.html',
    company: 'company.html'
};

// Chat proxy for specialists (worker/ in this repository, deployed to Cloudflare).
// null = chat not connected yet: staff.html says so instead of imitating answers.
// Example: 'https://airchitect-chat.<account>.workers.dev/chat'
const HOME_ASSISTANT_API = null;

// AIRCHITECT DOCS for contracts: approval and sending of notices through document management.
// false = the project office works on its own; DOCS actions are shown as unavailable.
const HOME_DOCS_CONNECTED = false;

// Specialists. The list is open-ended: add, edit or disable entries
// (enabled: false) and the home page grid rebuilds itself. Do not reference
// the number of specialists anywhere in texts or layout.
// icon: optional icon name from SPECIALIST_ICONS in script.js (defaults to the id).
// tasks: what the specialist helps with, shown on the specialist's own page (specialist.html?id=slug).
// registry: name of the specialist's register tab in "Штат" (staff.html?id=slug).
// actions: optional quick requests shown above the chat input for this specialist.
const HOME_SPECIALISTS = [
    {
        id: 'tender',
        slug: 'tender-specialist',
        title: { ru: 'Тендерный специалист', en: 'Tender specialist' },
        description: { ru: 'Закупочная документация и условия участия', en: 'Procurement documentation and participation terms' },
        registry: { ru: 'Реестр закупок', en: 'Procurement register' },
        tasks: [
            { title: 'Закупочная документация', text: 'Анализ документации и требований заказчика.' },
            { title: 'Условия участия', text: 'Сроки, требования к участнику и порядок подачи.' },
            { title: 'Проект договора', text: 'Предварительный анализ условий будущего договора.' },
            { title: 'Подготовка к участию', text: 'Перечень документов, необходимых для участия.' }
        ],
        // Links in the message are opened on the server (tender-core.js + worker), report can be saved to tenders.html
        analysis: 'tenders',
        actions: [
            { label: 'Анализ закупки по ссылке', prompt: 'Подготовь аналитическую справку по закупке: ' },
            { label: 'Сравнить тендеры', prompt: 'Сравни закупки по требованиям, обеспечениям, условиям оплаты, рискам и рентабельности:\n' },
            { label: 'Требования к участникам', prompt: 'Выдели требования к участникам и перечень документов заявки по закупке: ' },
            { label: 'Риски проекта договора', prompt: 'Оцени риски проекта договора (оплата, аванс, неустойки, приемка, гарантия) по закупке: ' },
            { label: 'Расчёт обеспечений', prompt: 'Рассчитай обеспечение заявки, исполнения и гарантийных обязательств, стоимость банковских гарантий и потребность в оборотных средствах по закупке: ' }
        ],
        enabled: true,
        order: 10
    },
    {
        id: 'lawyer',
        slug: 'construction-lawyer',
        title: { ru: 'Строительный юрист', en: 'Construction lawyer' },
        description: { ru: 'Правовые вопросы и оценка рисков', en: 'Legal questions and risk assessment' },
        registry: { ru: 'Реестр правовых документов', en: 'Legal documents register' },
        tasks: [
            { title: 'Правовые риски', text: 'Оценка рисков, связанных с условиями договора.' },
            { title: 'Спорные ситуации', text: 'Подготовка позиции по спорным вопросам.' },
            { title: 'Изменения договора', text: 'Работа с изменениями и дополнительными соглашениями.' },
            { title: 'Нормативные основания', text: 'Опора на законодательство РФ.' }
        ],
        enabled: true,
        order: 20
    },
    {
        id: 'contracts',
        slug: 'contract-specialist',
        title: { ru: 'Договорной специалист', en: 'Contract specialist' },
        // Main digital employee of a construction contract: works with Контракт — Исполнение (contract-workspace.js)
        featured: true,
        lead: { ru: 'Сопровождение строительных договоров от подписания до окончательного расчёта', en: 'Construction contracts from signing to final settlement' },
        description: { ru: 'Ведёт строительные договоры, контролирует обязательства, сроки и документы. Помогает предупреждать риски на всех этапах исполнения контракта.', en: 'Keeps construction contracts, obligations, deadlines and documents under control.' },
        about: { ru: 'Проверяет договоры, выделяет обязательства, контролирует сроки, отслеживает изменения условий, помогает оформлять дополнительные соглашения, уведомления и претензии. Сопровождает исполнение договора и взаимодействует с другими цифровыми специалистами.', en: 'Reviews contracts, tracks obligations and deadlines, prepares amendments, notices and claims.' },
        analysis: 'contract',
        registry: { ru: 'Реестр договоров', en: 'Contracts register' },
        tasks: [
            { title: 'Существенные условия', text: 'Выделение ключевых условий договора.' },
            { title: 'Обязательства сторон', text: 'Структурирование обязательств и сроков.' },
            { title: 'Паспорт договора', text: 'Сводка условий, сроков и обязательств.' },
            { title: 'Контрольные события', text: 'Работа с контрольными событиями и документами.' },
            { title: 'Изменения и претензии', text: 'Дополнительные соглашения, уведомления и претензии по договору.' },
            { title: 'Закрытие договора', text: 'Проверка готовности к окончательному расчёту и закрытию.' }
        ],
        enabled: true,
        order: 5
    },
    {
        id: 'finance',
        slug: 'financier',
        title: { ru: 'Финансист', en: 'Financier' },
        description: { ru: 'Платежи, авансы и финансовые условия', en: 'Payments, advances and financial terms' },
        registry: { ru: 'Реестр финансовых документов', en: 'Financial documents register' },
        tasks: [
            { title: 'Порядок оплаты', text: 'Разбор условий и сроков платежей.' },
            { title: 'Авансы', text: 'Анализ условий авансирования.' },
            { title: 'Удержания', text: 'Анализ гарантийных и иных удержаний.' },
            { title: 'Финансовые условия', text: 'Оценка финансовых последствий условий договора.' }
        ],
        actions: [
            { label: 'Кассовые разрывы', prompt: 'Оцени риск кассовых разрывов и предложи приоритеты платежей и источники финансирования: ' },
            { label: 'Дебиторская задолженность', prompt: 'Предложи план работы с дебиторской задолженностью и ускорения поступлений: ' },
            { label: 'Оптимизация расходов', prompt: 'Проанализируй расходы и обязательства и предложи, как снизить финансовую нагрузку: ' },
            { label: 'Порядок оплаты по договору', prompt: 'Разбери порядок оплаты, авансы, зачёт аванса и удержания по приложенному договору.' }
        ],
        enabled: true,
        order: 40
    },
    {
        id: 'security',
        slug: 'security-specialist',
        title: { ru: 'Специалист по безопасности', en: 'Security specialist' },
        description: { ru: 'Проверка контрагентов', en: 'Counterparty checks' },
        registry: { ru: 'Реестр контрагентов', en: 'Counterparties register' },
        tasks: [
            { title: 'Проверка контрагентов', text: 'Оценка надёжности будущего партнёра.' },
            { title: 'Риски сотрудничества', text: 'Выявление рисков до заключения договора.' },
            { title: 'Документы контрагента', text: 'Проверка полноты представленных документов.' }
        ],
        // ИНН in the message are checked in public registries on the server (counterparty-core.js + worker)
        analysis: 'counterparty',
        actions: [
            { label: 'Проверить компанию', prompt: 'Проверь компанию по ИНН: ' },
            { label: 'Финансовый анализ', prompt: 'Проанализируй финансовую устойчивость по отчётности (ликвидность, капитал, долговая нагрузка, динамика) компании с ИНН: ' },
            { label: 'Суды и долги', prompt: 'Какие судебные и исполнительные риски нужно проверить по компании и как оценить приложенные сведения? ИНН: ' },
            { label: 'Проверить СРО', prompt: 'Проверь членство в СРО и уровни ответственности для работ по договору на сумму … ИНН: ' },
            { label: 'Корпоративные связи', prompt: 'Проверь признаки связей между компаниями (руководители, учредители, адреса): ' },
            { label: 'Сравнить контрагентов', prompt: 'Сравни надёжность компаний и составь сравнительную таблицу. ИНН: ' },
            { label: 'Оценить риски договора', prompt: 'Оцени риски договора и аванса с компанией (сумма договора, аванс %). ИНН: ' },
            { label: 'Подготовить заключение', prompt: 'Подготовь заключение о целесообразности сотрудничества с мерами защиты. ИНН: ' }
        ],
        enabled: true,
        order: 50
    },
    {
        id: 'pto',
        slug: 'pto-engineer',
        title: { ru: 'Инженер ПТО', en: 'Technical documentation engineer' },
        description: { ru: 'Техническая и исполнительная документация', en: 'Technical and as-built documentation' },
        registry: { ru: 'Реестр технической документации', en: 'Technical documentation register' },
        // Quick professional actions in the chat (Штат): label and the request placed into the input
        actions: [
            { label: 'Проверить АОСР', prompt: 'Проверь приложенный акт освидетельствования скрытых работ: заполнение реквизитов, ссылки на РД, документы о качестве материалов, подписи. Перечисли ошибки и что исправить.' },
            { label: 'Состав ИД по виду работ', prompt: 'Составь перечень исполнительной документации для вида работ: ' },
            { label: 'Реестр ИД', prompt: 'Подготовь реестр исполнительной документации для передачи заказчику по приложенным документам.' },
            { label: 'Подготовить КС-11', prompt: 'Помоги подготовить акт приёмки законченного строительством объекта (КС-11): что указать в пунктах 1–15 и какие документы приложить для объекта: ' },
            { label: 'Приёмочная комиссия (КС-14)', prompt: 'Что нужно для приёмки объекта комиссией по форме КС-14: состав комиссии, документы, порядок? Объект: ' },
            { label: 'Приостановление (КС-17, КС-18)', prompt: 'Помоги оформить приостановление строительства (КС-17) или проектно-изыскательских работ (КС-18): основания, расчёты с подрядчиком, консервация. Ситуация: ' },
            { label: 'Временные сооружения (КС-8, КС-9)', prompt: 'Помоги оформить сдачу в эксплуатацию и разборку временного (нетитульного) сооружения по формам КС-8 и КС-9: ' },
            { label: 'Снос и перенос (КС-10)', prompt: 'Помоги составить акт об оценке подлежащих сносу (переносу) строений и насаждений (КС-10): ' },
            { label: 'Проверить КС-2 и КС-3', prompt: 'Проверь приложенные КС-2 и КС-3: обязательные реквизиты, соответствие объёмов смете и КС-6а, расчёты, НДС, накопительные итоги и комплектность приложений. Перечисли ошибки и риски отказа в приёмке.' },
            { label: 'Сверить с РД', prompt: 'Сверь приложенную исполнительную документацию с рабочей документацией (шифр, марка, версия) и укажи расхождения.' },
            { label: 'Ответ на замечания', prompt: 'Подготовь ответ на замечания строительного контроля по исполнительной документации: ' },
            { label: 'Документы о качестве', prompt: 'Проверь приложенные паспорта, сертификаты и протоколы испытаний: соответствие материалам, сроки действия, реквизиты.' }
        ],
        tasks: [
            { title: 'Техническая документация', text: 'Работа с проектной и рабочей документацией.' },
            { title: 'Исполнительная документация', text: 'Подготовка и систематизация исполнительной документации.' },
            { title: 'Нормативные требования', text: 'Проверка соответствия строительным правилам и стандартам.' }
        ],
        enabled: true,
        order: 60
    },
    {
        id: 'estimator',
        slug: 'estimator',
        title: { ru: 'Сметчик', en: 'Cost estimator' },
        description: { ru: 'Сметные расчёты', en: 'Cost estimates' },
        registry: { ru: 'Реестр смет', en: 'Estimates register' },
        tasks: [
            { title: 'Сметные расчёты', text: 'Работа со сметной документацией.' },
            { title: 'Проверка смет', text: 'Анализ сметы и её соответствия объёму работ.' },
            { title: 'Смета и договор', text: 'Сопоставление сметы с условиями договора.' }
        ],
        // Answers can be saved to an estimate card (estimates-core.js)
        analysis: 'estimates',
        actions: [
            { label: 'Проверить смету', prompt: 'Проверь приложенную смету: арифметику, объёмы и единицы измерения, расценки, коэффициенты, дублирование и пропущенные работы. Укажи конкретные позиции и финансовый эффект.' },
            { label: 'Создать смету', prompt: 'Помоги составить перечень позиций сметы (наименование, единица, объём) для работ: ' },
            { label: 'Сравнить расценки', prompt: 'Сравни расценки сметы с приложенными коммерческими предложениями: где цены завышены или занижены и на сколько.' },
            { label: 'Рассчитать себестоимость', prompt: 'Помоги оценить себестоимость работ по смете: материалы, труд, техника, субподряд, накладные, риски. ' },
            { label: 'Оптимизировать стоимость', prompt: 'Предложи технически допустимые способы снизить стоимость по смете с указанием эффекта, ограничений, согласований и договорных последствий.' },
            { label: 'Сравнить редакции', prompt: 'Сравни две приложенные редакции сметы: какие позиции добавлены, удалены и изменены, и как изменился итог.' },
            { label: 'Подготовить заключение', prompt: 'Подготовь заключение по проверке сметы с перечнем ошибок, отклонений, финансового эффекта и рекомендаций.' }
        ],
        enabled: true,
        order: 70
    },
    {
        id: 'chief-engineer',
        slug: 'chief-engineer',
        title: { ru: 'Главный инженер', en: 'Chief engineer' },
        description: { ru: 'Технические решения и нормативы', en: 'Technical decisions and regulations' },
        registry: { ru: 'Реестр технических решений', en: 'Technical decisions register' },
        tasks: [
            { title: 'Технические решения', text: 'Оценка технических решений по объекту.' },
            { title: 'Нормативы', text: 'Работа со строительными правилами и стандартами.' },
            { title: 'Технические риски', text: 'Выявление технических рисков.' }
        ],
        enabled: true,
        order: 80
    },
    {
        id: 'project-manager',
        slug: 'project-manager',
        title: { ru: 'Руководитель проекта', en: 'Project manager' },
        description: { ru: 'Организация работы и контрольные сроки', en: 'Work organization and control dates' },
        registry: { ru: 'Реестр документов проекта', en: 'Project documents register' },
        tasks: [
            { title: 'Организация работы', text: 'Определение действий и ответственных.' },
            { title: 'Контрольные сроки', text: 'Планирование и контроль ключевых сроков.' },
            { title: 'Действия по договору', text: 'План действий по исполнению обязательств.' },
            { title: 'Взаимодействие специалистов', text: 'Объединение выводов разных специалистов.' }
        ],
        enabled: true,
        order: 90
    }
];
