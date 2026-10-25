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
    regulatory: 'aircodex/',
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
        title: { ru: 'Юрист', en: 'Construction lawyer' },
        description: { ru: 'Правовые вопросы и споры', en: 'Legal questions and disputes' },
        // Workspace in Штат (lawyer-workspace.js); norms and practice are checked on official sources (worker)
        analysis: 'legal',
        registry: { ru: 'Реестр правовых документов', en: 'Legal documents register' },
        tasks: [
            { title: 'Правовая экспертиза договоров', text: 'Риски условий, протоколы разногласий, предлагаемые редакции с правовым обоснованием.' },
            { title: 'Претензии и иски', text: 'Претензии, уведомления, дополнительные соглашения, исковые заявления.' },
            { title: 'Строительные споры', text: 'Оплата, сроки, объёмы и качество работ: позиция, доказательства, сроки.' },
            { title: 'Консультации', text: 'Строительное законодательство, 44-ФЗ, 223-ФЗ, СРО, исполнительная документация, приёмка.' },
            { title: 'Судебная практика', text: 'Только реальные дела с реквизитами и ссылками на официальные источники.' },
            { title: 'Юридические риски', text: 'Оценка рисков и рекомендации по их устранению.' }
        ],
        enabled: true,
        order: 20
    },
    {
        id: 'contracts',
        slug: 'contract-specialist',
        title: { ru: 'Договорной специалист', en: 'Contract specialist' },
        // Main digital employee of a construction contract: works with Договоры (contract-workspace.js)
        featured: true,
        description: { ru: 'Договоры, сроки, обязательства', en: 'Contracts, deadlines, obligations' },
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
        title: { ru: 'Инженер-сметчик', en: 'Cost estimator' },
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
        id: 'procurement',
        slug: 'procurement-specialist',
        title: { ru: 'Специалист по закупкам и снабжению', en: 'Procurement and supply specialist' },
        description: { ru: 'Закупки материалов и поставки', en: 'Materials purchasing and supply' },
        registry: { ru: 'Документы и результаты закупок', en: 'Procurement documents and results' },
        icon: 'procurement',
        tasks: [
            { title: 'Заявки и спецификации', text: 'Разбор заявок, спецификаций и потребностей объекта.' },
            { title: 'Запросы КП', text: 'Подготовка запросов коммерческих предложений.' },
            { title: 'Сравнение поставщиков', text: 'Характеристики, комплектность, полная стоимость, сроки и условия оплаты.' },
            { title: 'Проверка предложений', text: 'Пропуски, расхождения и дополнительные расходы.' },
            { title: 'Закупочные документы', text: 'Справка, сравнительная таблица и проект протокола выбора.' },
            { title: 'Контроль поставок', text: 'Обязательства по поставке и письма при задержке, недопоставке или несоответствии.' }
        ],
        // Purchases and supply control points of Договоры are passed as context (procurement-workspace.js)
        analysis: 'procurement',
        actions: [
            { label: 'Сравнить коммерческие предложения', prompt: 'Сравни приложенные коммерческие предложения: характеристики и соответствие заявке, комплектность, цена без НДС и с НДС, доставка, разгрузка, аванс и условия оплаты, гарантия, требуемый и подтверждённый срок поставки. Неизвестные расходы выдели отдельно, технические аналоги отметь для согласования.' },
            { label: 'Подготовить запрос поставщикам', prompt: 'Подготовь запрос коммерческих предложений по заявке объекта: перечень позиций с количеством и единицами, требуемый срок и адрес поставки, условия, которые поставщик должен указать (цена с НДС, доставка, разгрузка, оплата, гарантия, документы о качестве). Заявка: ' },
            { label: 'Проверить условия поставки', prompt: 'Проверь условия поставки в приложенном предложении или договоре поставки: сроки и их подтверждение, порядок приёмки, переход права собственности и рисков, оплата и аванс, ответственность поставщика, документы о качестве. Укажи пропуски и риски.' },
            { label: 'Собрать комплект закупочных документов', prompt: 'Собери комплект закупочных документов по закупке с едиными реквизитами: запрос КП, сравнительная таблица, закупочная справка, проект протокола выбора поставщика. Закупка: ' },
            { label: 'Подготовить справку для руководителя', prompt: 'Подготовь краткую закупочную справку для руководителя: потребность, рассмотренные поставщики, полная стоимость, сроки, риски и неизвестные расходы, вопросы на решение. Итоговый выбор оставь за руководителем.' }
        ],
        enabled: true,
        order: 75
    },
    {
        id: 'chief-engineer',
        slug: 'chief-engineer',
        title: { ru: 'Главный инженер', en: 'Chief engineer' },
        description: { ru: 'Контроль ПТО и смет', en: 'Control of PTO and estimates' },
        registry: { ru: 'Реестр технических решений', en: 'Technical decisions register' },
        tasks: [
            { title: 'Контроль инженера ПТО', text: 'Проверка РД, исполнительной документации и форм КС.' },
            { title: 'Контроль инженера-сметчика', text: 'Проверка смет, объёмов и технических решений по экономии.' },
            { title: 'Технические решения', text: 'Оценка решений и соответствия нормативам.' },
            { title: 'Технические риски', text: 'Выявление технических рисков по объекту.' }
        ],
        enabled: true,
        order: 80
    },
    {
        id: 'project-manager',
        slug: 'project-manager',
        title: { ru: 'Руководитель проекта', en: 'Project manager' },
        description: { ru: 'Координация всех специалистов', en: 'Coordination of all specialists' },
        registry: { ru: 'Реестр документов проекта', en: 'Project documents register' },
        tasks: [
            { title: 'Координация команды', text: 'Договорной специалист, юрист, финансист, тендерный специалист, безопасность.' },
            { title: 'Контрольные сроки', text: 'Ключевые сроки по договорам, объектам и закупкам.' },
            { title: 'Задачи руководителя', text: 'Решения и действия по выводам специалистов.' },
            { title: 'Сводка по проекту', text: 'Состояние договоров, рисков и финансов.' }
        ],
        enabled: true,
        order: 90
    }
];
