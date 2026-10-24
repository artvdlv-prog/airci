// Structure of the unified construction forms beyond КС-2 / КС-3 (objects-ks.js uses it).
// Columns and requisites follow the blanks of Госкомстат России: постановление от 11.11.1999 № 100
// (КС-8, КС-9, КС-10, КС-17, КС-18) and от 30.10.1997 № 71а (КС-11, КС-14), as published in the
// form albums. Since 2013 the forms are not mandatory by themselves (ст. 9 402-ФЗ): the contract decides.
//
// field: { key, label, type: text|date|number|textarea, auto: key of the autofill source, required }
// table: { key, title, columns: [{ key, label, type, calc, total }], rows from the user or autofill }

window.AirchitectKsForms = (function () {
    const P100 = 'постановление Госкомстата России от 11.11.1999 № 100';
    const P71 = 'постановление Госкомстата России от 30.10.1997 № 71а';
    const party = ['investor', 'customer', 'contractor'];

    const FORMS = {
        'КС-8': {
            title: 'Акт о сдаче в эксплуатацию временного (нетитульного) сооружения', okud: '0322007', basis: P100,
            use: 'Приёмка законченного временного (нетитульного) сооружения: бытовые помещения, склады, временные дороги и сети.',
            fields: [
                { key: 'organization', label: 'Организация (наименование, адрес)', auto: 'contractor', required: true },
                { key: 'unit', label: 'Структурное подразделение' },
                { key: 'structure', label: 'Объект (сооружение)', required: true },
                { key: 'contract', label: 'Договор подряда (контракт): номер, дата', auto: 'contract' },
                { key: 'area', label: 'Площадь, м²', type: 'number' },
                { key: 'volume', label: 'Объём, м³', type: 'number' },
                { key: 'cost', label: 'Фактическая себестоимость объекта (сооружения), руб.', type: 'number', required: true },
                { key: 'dismantling', label: 'Ожидаемые расходы по разборке, руб.', type: 'number' },
                { key: 'lifetime', label: 'Срок полезного использования, месяцев', type: 'number', required: true },
                { key: 'responsible', label: 'Ответственное лицо за возврат материалов (должность, ФИО)', required: true },
                { key: 'keeper', label: 'Объект на ответственное хранение принял (должность, ФИО)' }
            ],
            tables: [{
                key: 'materials', title: 'Материалы, подлежащие возврату', total: 'sum',
                columns: [
                    { key: 'name', label: 'Наименование материалов' }, { key: 'unit', label: 'Единица измерения' },
                    { key: 'qty', label: 'Количество', type: 'number' }, { key: 'fit', label: 'Процент годности', type: 'number' },
                    { key: 'price', label: 'Цена, руб.', type: 'number' }, { key: 'sum', label: 'Сумма, руб.', type: 'number', calc: r => r.qty * r.price }
                ]
            }],
            summary: d => [['Ожидаемый возврат материалов, руб.', tableTotal(d, 'materials', 'sum')]],
            signs: ['Председатель комиссии', 'Члены комиссии', 'Объект на ответственное хранение принял', 'Главный бухгалтер (оприходование)']
        },
        'КС-9': {
            title: 'Акт о разборке временных (нетитульных) сооружений', okud: '0322008', basis: P100,
            use: 'Разборка временного сооружения и оприходование возвращённых материалов; предполагаемый возврат берётся из КС-8.',
            fields: [
                { key: 'organization', label: 'Организация (наименование)', auto: 'contractor', required: true },
                { key: 'unit', label: 'Структурное подразделение' },
                { key: 'structure', label: 'Объект (сооружение)', required: true },
                { key: 'contract', label: 'Договор подряда (контракт): номер, дата', auto: 'contract' },
                { key: 'keeper', label: 'Материалы на хранение принял: материально ответственное лицо (должность, ФИО)', required: true }
            ],
            tables: [{
                key: 'materials', title: 'После разборки оприходованию подлежат следующие материалы', total: 'sum',
                columns: [
                    { key: 'name', label: 'Наименование материалов' }, { key: 'nomenclature', label: 'Номенклатурный номер' }, { key: 'unit', label: 'Единица измерения' },
                    { key: 'expQty', label: 'Предполагаемый возврат: количество', type: 'number' }, { key: 'expFit', label: 'Предполагаемый возврат: процент годности', type: 'number' },
                    { key: 'qty', label: 'Фактический возврат: количество', type: 'number' }, { key: 'fit', label: 'Фактический возврат: процент годности', type: 'number' },
                    { key: 'price', label: 'Цена, руб.', type: 'number' }, { key: 'sum', label: 'Сумма, руб.', type: 'number', calc: r => r.qty * r.price },
                    { key: 'note', label: 'Объяснение расхождения в возврате' }
                ]
            }],
            summary: d => [['Оприходовано материалов на сумму, руб.', tableTotal(d, 'materials', 'sum')]],
            signs: ['Председатель комиссии', 'Члены комиссии', 'Материально ответственное лицо']
        },
        'КС-10': {
            title: 'Акт об оценке подлежащих сносу (переносу) зданий, строений, сооружений и насаждений', okud: '0322009', basis: P100,
            use: 'Оценка строений и насаждений, подлежащих сносу или переносу в связи со строительством, для возмещения собственнику.',
            fields: [
                { key: 'organization', label: 'Организация (наименование, адрес)', auto: 'customer', required: true },
                { key: 'reason', label: 'Основание для сноса строений, насаждений: документ, номер, дата', required: true },
                { key: 'approver', label: '«Утверждаю»: должность, ФИО' },
                { key: 'place', label: 'Место составления акта', auto: 'address' },
                { key: 'object', label: 'Наименование объекта осмотра и оценки', required: true },
                { key: 'cause', label: 'Причина сноса', required: true },
                { key: 'owner', label: 'Собственник (владелец): наименование, адрес, ИНН', required: true },
                { key: 'passport', label: 'Технический паспорт строения: номер, дата' },
                { key: 'compensation', label: 'Стоимость по рыночной цене, подлежащая возмещению собственнику, руб.', type: 'number', required: true },
                { key: 'compensationBasis', label: 'Основание возмещения (прилагается расчёт)', required: true }
            ],
            tables: [{
                key: 'items', title: 'Строения и насаждения', total: 'value',
                columns: [
                    { key: 'purpose', label: 'Назначение строения или насаждения' }, { key: 'year', label: 'Год ввода в эксплуатацию', type: 'number' },
                    { key: 'description', label: 'Характеристика объекта (фундамент, стены, перекрытия, крыша, благоустройство)' },
                    { key: 'area', label: 'Площадь, м²', type: 'number' }, { key: 'height', label: 'Высота, м', type: 'number' }, { key: 'volume', label: 'Объём, м³', type: 'number' },
                    { key: 'plants', label: 'Количество насаждений, шт.', type: 'number' }, { key: 'value', label: 'Стоимость на дату оценки, руб.', type: 'number' }, { key: 'note', label: 'Примечание' }
                ]
            }],
            summary: d => [['Всего по акту (стоимость на дату оценки), руб.', tableTotal(d, 'items', 'value')], ['Подлежит возмещению собственнику, руб.', Number(d.fields.compensation) || 0, true]],
            signs: ['Председатель комиссии', 'Члены комиссии', 'Собственник (владелец): с оценкой согласен']
        },
        'КС-11': {
            title: 'Акт приёмки законченного строительством объекта', okud: '0336003', basis: P71,
            use: 'Приёмка законченного объекта заказчиком от генподрядчика. Не заменяет разрешение на ввод объекта в эксплуатацию (ст. 55 ГрК РФ).',
            fields: [
                { key: 'customer', label: 'Заказчик в лице (должность, ФИО)', auto: 'customerPerson', required: true },
                { key: 'contractor', label: 'Исполнитель работ (генподрядчик, подрядчик) в лице (должность, ФИО)', auto: 'contractorPerson', required: true },
                { key: 'object', label: '1. Объект, предъявленный к приёмке (наименование, вид строительства, адрес)', auto: 'object', required: true },
                { key: 'permit', label: '2. Разрешение на строительство (кем выдано, номер, дата)', auto: 'permit', required: true },
                { key: 'subcontractors', label: '3. Субподрядные организации и виды работ', type: 'textarea', auto: 'subcontractors' },
                { key: 'designers', label: '4. Проектная документация: генпроектировщик и субподрядчики, части и разделы', type: 'textarea', auto: 'designers' },
                { key: 'research', label: '5. Исходные данные: изыскательские и научно-исследовательские организации', type: 'textarea' },
                { key: 'approval', label: '6. Проектная документация утверждена (орган, дата, номер)' },
                { key: 'start', label: 'Начало работ', type: 'date', auto: 'start', required: true },
                { key: 'end', label: 'Окончание работ', type: 'date', auto: 'end', required: true },
                { key: 'equipment', label: '9. Оборудование: акты индивидуального испытания и комплексного опробования (приложения)', type: 'textarea', auto: 'tests' },
                { key: 'networks', label: '10. Внешние коммуникации: справки эксплуатационных организаций (приложения)', type: 'textarea' },
                { key: 'costTotal', label: '12. Стоимость объекта по проектной документации: всего, руб.', type: 'number', auto: 'contractPrice' },
                { key: 'costSmr', label: '12. в том числе строительно-монтажные работы, руб.', type: 'number' },
                { key: 'costEquip', label: '12. в том числе оборудование, инструмент и инвентарь, руб.', type: 'number' },
                { key: 'fundsTotal', label: '13. Стоимость принимаемых основных фондов: всего, руб.', type: 'number', auto: 'accepted' },
                { key: 'fundsSmr', label: '13. в том числе строительно-монтажные работы, руб.', type: 'number', auto: 'accepted' },
                { key: 'fundsEquip', label: '13. в том числе оборудование, инструмент и инвентарь, руб.', type: 'number' },
                { key: 'documentation', label: '14. Документация, предъявленная при приёмке', type: 'textarea', auto: 'documentation' },
                { key: 'conditions', label: '15. Дополнительные условия', type: 'textarea' }
            ],
            tables: [
                { key: 'indicators', title: '7. Характеристика объекта (кроме жилых домов): показатели по проекту и фактически', columns: [
                    { key: 'name', label: 'Показатель' }, { key: 'unit', label: 'Единица измерения' }, { key: 'plan', label: 'По проекту', type: 'number' }, { key: 'fact', label: 'Фактически', type: 'number' }] },
                { key: 'housing', title: '8. Жилые дома: показатели по проекту и фактически', columns: [
                    { key: 'name', label: 'Показатель (площадь застройки, этажность, строительный объём, квартиры)' }, { key: 'unit', label: 'Единица измерения' }, { key: 'plan', label: 'По проекту', type: 'number' }, { key: 'fact', label: 'Фактически', type: 'number' }] },
                { key: 'remaining', title: '11. Работы, подлежащие выполнению', columns: [
                    { key: 'name', label: 'Работы' }, { key: 'unit', label: 'Единица измерения' }, { key: 'qty', label: 'Объём работ', type: 'number' }, { key: 'due', label: 'Срок выполнения' }] }
            ],
            summary: d => [['Стоимость по проектной документации, руб.', Number(d.fields.costTotal) || 0], ['Стоимость принимаемых основных фондов, руб.', Number(d.fields.fundsTotal) || 0]],
            signs: ['Объект сдал: исполнитель работ (генподрядчик, подрядчик)', 'Объект принял: заказчик']
        },
        'КС-14': {
            title: 'Акт приёмки законченного строительством объекта приёмочной комиссией', okud: '0336004', basis: P71,
            use: 'Приёмка объекта приёмочной комиссией, если она предусмотрена договором или решением застройщика (инвестора).',
            fields: [
                { key: 'location', label: 'Местонахождение объекта', auto: 'address', required: true },
                { key: 'commission', label: 'Приёмочная комиссия назначена (орган, решение, дата)', required: true },
                { key: 'object', label: '1. Объект, предъявленный комиссии (наименование, вид строительства, адрес)', auto: 'object', required: true },
                { key: 'permit', label: '2. Разрешение на строительство (кем выдано, номер, дата)', auto: 'permit', required: true },
                { key: 'subcontractors', label: '3. Субподрядные организации и виды работ', type: 'textarea', auto: 'subcontractors' },
                { key: 'designers', label: '4. Проектная документация: генпроектировщик и субподрядчики', type: 'textarea', auto: 'designers' },
                { key: 'research', label: '5. Исходные данные', type: 'textarea' },
                { key: 'approval', label: '6. Проектная документация утверждена (орган, дата, номер)' },
                { key: 'start', label: '7. Начало строительно-монтажных работ', type: 'date', auto: 'start', required: true },
                { key: 'end', label: '7. Окончание строительно-монтажных работ', type: 'date', auto: 'end', required: true },
                { key: 'equipment', label: '9. Оборудование: акты испытаний и опробования (приложения)', type: 'textarea', auto: 'tests' },
                { key: 'networks', label: '10. Внешние коммуникации: справки пользователей (приложения)', type: 'textarea' },
                { key: 'costTotal', label: '12. Стоимость по проектной документации: всего, руб.', type: 'number', auto: 'contractPrice' },
                { key: 'costSmr', label: '12. в том числе строительно-монтажные работы, руб.', type: 'number' },
                { key: 'costEquip', label: '12. в том числе оборудование, инструмент и инвентарь, руб.', type: 'number' },
                { key: 'fundsTotal', label: '13. Стоимость принимаемых основных фондов: всего, руб.', type: 'number', auto: 'accepted' },
                { key: 'fundsSmr', label: '13. в том числе строительно-монтажные работы, руб.', type: 'number', auto: 'accepted' },
                { key: 'fundsEquip', label: '13. в том числе оборудование, инструмент и инвентарь, руб.', type: 'number' },
                { key: 'documentation', label: '14. Документация, предъявленная комиссии', type: 'textarea', auto: 'documentation' },
                { key: 'conditions', label: '15. Дополнительные условия', type: 'textarea' },
                { key: 'decision', label: 'Решение приёмочной комиссии', type: 'textarea', required: true, hint: 'Заполняет комиссия по результатам приёмки' },
                { key: 'chairman', label: 'Председатель комиссии (должность, ФИО)', required: true },
                { key: 'members', label: 'Члены комиссии (должность, ФИО — каждый с новой строки)', type: 'textarea', auto: 'members', required: true }
            ],
            tables: [
                { key: 'indicators', title: '8. Характеристика объекта (кроме жилых домов)', columns: [
                    { key: 'name', label: 'Показатель' }, { key: 'unit', label: 'Единица измерения' }, { key: 'plan', label: 'По проекту', type: 'number' }, { key: 'fact', label: 'Фактически', type: 'number' }, { key: 'jobs', label: 'Количество рабочих мест', type: 'number' }] },
                { key: 'housing', title: '8. Жилые дома', columns: [
                    { key: 'name', label: 'Показатель' }, { key: 'unit', label: 'Единица измерения' }, { key: 'plan', label: 'По проекту', type: 'number' }, { key: 'fact', label: 'Фактически', type: 'number' }] },
                { key: 'remaining', title: '11. Работы, подлежащие выполнению', columns: [
                    { key: 'name', label: 'Работы' }, { key: 'unit', label: 'Единица измерения' }, { key: 'qty', label: 'Объём работ', type: 'number' }, { key: 'due', label: 'Срок выполнения' }] }
            ],
            summary: d => [['Стоимость по проектной документации, руб.', Number(d.fields.costTotal) || 0], ['Стоимость принимаемых основных фондов, руб.', Number(d.fields.fundsTotal) || 0]],
            signs: ['Председатель комиссии', 'Члены комиссии']
        },
        'КС-17': {
            title: 'Акт о приостановлении строительства', okud: '0322010', basis: P100,
            use: 'Приостановление (консервация) или прекращение строительства; основа окончательных расчётов с подрядчиком.',
            fields: [
                { key: 'investor', label: 'Инвестор (организация, адрес)', auto: 'investor' },
                { key: 'customer', label: 'Заказчик (генподрядчик) (организация, адрес)', auto: 'customer', required: true },
                { key: 'contractor', label: 'Подрядчик (субподрядчик) (организация, адрес)', auto: 'contractor', required: true },
                { key: 'site', label: 'Стройка (наименование, адрес)', auto: 'object', required: true },
                { key: 'contract', label: 'Договор подряда (контракт): номер, дата', auto: 'contract', required: true },
                { key: 'permit', label: 'Основание для разрешения на строительство: документ, номер, дата', auto: 'permit' },
                { key: 'reason', label: 'Основание для приостановления строительства: документ, номер, дата', required: true }
            ],
            tables: [{
                key: 'items', title: 'Объекты, работы и затраты, приостановленные строительством', total: ['full', 'fullSmr', 'done', 'doneSmr', 'actual', 'settle', 'losses', 'conservation'],
                columns: [
                    { key: 'name', label: 'Наименование и назначение объектов, работ и затрат' }, { key: 'code', label: 'Код' }, { key: 'start', label: 'Дата начала строительства' },
                    { key: 'full', label: 'Полная сметная (договорная) стоимость: всего, руб.', type: 'number' }, { key: 'fullSmr', label: 'в том числе СМР, руб.', type: 'number' },
                    { key: 'done', label: 'Стоимость выполненных работ на дату приостановления: всего, руб.', type: 'number' }, { key: 'doneSmr', label: 'в том числе СМР, руб.', type: 'number' },
                    { key: 'actual', label: 'Фактические затраты на дату приостановления по балансу застройщика, руб.', type: 'number' },
                    { key: 'settle', label: 'Средства для расчётов с подрядной организацией, включая незавершённое производство, руб.', type: 'number' },
                    { key: 'losses', label: 'В том числе убытки, неустойки подрядчика по расторжению договоров поставки, руб.', type: 'number' },
                    { key: 'conservation', label: 'Стоимость работ и затрат на консервацию, руб.', type: 'number' }
                ]
            }],
            summary: d => [['Всего по акту: средства для расчётов с подрядчиком, руб.', tableTotal(d, 'items', 'settle')], ['Стоимость консервации, руб.', tableTotal(d, 'items', 'conservation')]],
            signs: ['Руководитель организации заказчика', 'Главный бухгалтер заказчика', 'Руководитель подрядной организации', 'Главный бухгалтер подрядчика']
        },
        'КС-18': {
            title: 'Акт о приостановлении проектно-изыскательских работ по неосуществлённому строительству', okud: '0322011', basis: P100,
            use: 'Приостановление начатых проектно-изыскательских работ по строительству, которое не будет осуществляться.',
            fields: [
                { key: 'investor', label: 'Инвестор (организация, адрес)', auto: 'investor' },
                { key: 'customer', label: 'Заказчик (организация, адрес)', auto: 'customer', required: true },
                { key: 'designer', label: 'Проектная организация (организация, адрес)', auto: 'designer', required: true },
                { key: 'site', label: 'Стройка (наименование, адрес)', auto: 'object', required: true },
                { key: 'contract', label: 'Договор подряда (контракт): номер, дата', auto: 'contract', required: true },
                { key: 'task', label: 'Задание на проектирование: номер, дата' },
                { key: 'reason', label: 'Основание для приостановления проектно-изыскательских работ: документ, номер, дата', required: true }
            ],
            tables: [{
                key: 'items', title: 'Объекты и стадии работ', total: ['full', 'done', 'actual', 'settle', 'losses', 'conservation'],
                columns: [
                    { key: 'name', label: 'Наименование объекта, стадий работ' }, { key: 'justification', label: 'Обоснование прекращения проектно-изыскательских работ' },
                    { key: 'full', label: 'Полная сметная (договорная) стоимость ПИР, руб.', type: 'number' }, { key: 'done', label: 'Стоимость выполненных ПИР до приостановления, руб.', type: 'number' },
                    { key: 'actual', label: 'Фактические затраты на дату приостановления по данным заказчика, руб.', type: 'number' },
                    { key: 'settle', label: 'Средства для расчётов с проектной организацией, включая незавершённые ПИР, руб.', type: 'number' },
                    { key: 'losses', label: 'В том числе убытки и неустойки проектной организации, руб.', type: 'number' },
                    { key: 'conservation', label: 'Стоимость работ и затрат на консервацию ПИР, руб.', type: 'number' }
                ]
            }],
            summary: d => [['Всего по акту: средства для расчётов с проектной организацией, руб.', tableTotal(d, 'items', 'settle')]],
            signs: ['Руководитель организации заказчика', 'Главный бухгалтер заказчика', 'Руководитель проектной (подрядной) организации', 'Главный бухгалтер проектной организации']
        }
    };

    function rowValues(table, r) {
        const out = { ...r };
        table.columns.forEach(c => { if (c.type === 'number' && c.key in out) out[c.key] = Number(out[c.key]) || 0; });
        table.columns.forEach(c => { if (c.calc) out[c.key] = Math.round(c.calc(out) * 100) / 100; });
        return out;
    }
    function tableTotal(d, key, col) {
        const f = FORMS[d.form];
        const t = f.tables.find(x => x.key === key);
        return Math.round(((d.tables && d.tables[key]) || []).reduce((s, r) => s + (rowValues(t, r)[col] || 0), 0) * 100) / 100;
    }

    // Rule-based checks of a filled form: requisites, arithmetic and consistency between graphs
    function check(d) {
        const f = FORMS[d.form];
        const out = [];
        const add = (level, text) => out.push({ level, text });
        f.fields.filter(x => x.required && !String((d.fields || {})[x.key] ?? '').trim()).forEach(x => add('error', `Не заполнено: ${x.label}.`));
        const rows = key => ((d.tables || {})[key] || []).map(r => rowValues(f.tables.find(t => t.key === key), r));
        if (d.form === 'КС-8') {
            if (!rows('materials').length) add('warning', 'Нет материалов, подлежащих возврату: проверьте, будут ли материалы после разборки.');
            rows('materials').forEach((r, i) => { if (r.fit > 100 || r.fit < 0) add('error', `Строка ${i + 1}: процент годности вне 0–100.`); });
        }
        if (d.form === 'КС-9') {
            rows('materials').forEach((r, i) => {
                if ((r.qty !== r.expQty || r.fit !== r.expFit) && !String(r.note || '').trim()) add('error', `Строка ${i + 1} «${r.name}»: фактический возврат отличается от предполагаемого — нужно объяснение расхождения.`);
                if (!r.nomenclature) add('warning', `Строка ${i + 1} «${r.name}»: не указан номенклатурный номер.`);
            });
        }
        if (d.form === 'КС-10') {
            const total = tableTotal(d, 'items', 'value');
            const comp = Number(d.fields.compensation) || 0;
            if (!rows('items').length) add('error', 'Нет строений и насаждений для оценки.');
            if (comp && total && Math.abs(comp - total) > 0.01) add('warning', `Возмещение собственнику (${comp.toLocaleString('ru-RU')} руб.) отличается от итога оценки (${total.toLocaleString('ru-RU')} руб.): приложите расчёт рыночной стоимости.`);
        }
        if (d.form === 'КС-17' || d.form === 'КС-18') {
            rows('items').forEach((r, i) => {
                if (r.done > r.full && r.full) add('error', `Строка ${i + 1}: стоимость выполненных работ больше полной стоимости.`);
                if (!r.full && r.done) add('warning', `Строка ${i + 1}: не указана полная сметная (договорная) стоимость.`);
                if (!r.settle) add('warning', `Строка ${i + 1}: не указаны средства для расчётов — без них акт не служит основой окончательных расчётов.`);
                if (d.form === 'КС-17' && r.fullSmr > r.full) add('error', `Строка ${i + 1}: СМР больше полной стоимости.`);
                if (d.form === 'КС-17' && r.doneSmr > r.done) add('error', `Строка ${i + 1}: СМР выполненных работ больше их стоимости.`);
                if (r.losses > r.settle && r.settle) add('error', `Строка ${i + 1}: убытки и неустойки больше средств для расчётов (графа «в том числе»).`);
            });
            if (!rows('items').length) add('error', 'Нет строк с объектами и работами.');
        }
        if (d.form === 'КС-11' || d.form === 'КС-14') {
            const v = k => Number(d.fields[k]) || 0;
            if (v('costSmr') + v('costEquip') > v('costTotal') + 0.01 && v('costTotal')) add('error', 'П. 12: СМР и оборудование больше общей стоимости.');
            if (v('fundsSmr') + v('fundsEquip') > v('fundsTotal') + 0.01 && v('fundsTotal')) add('error', 'П. 13: СМР и оборудование больше стоимости основных фондов.');
            if (d.fields.start && d.fields.end && d.fields.start > d.fields.end) add('error', 'Начало работ позже окончания.');
        }
        return out;
    }

    // Amount in words for acts (КС-10): «один миллион двести тысяч рублей 00 копеек»
    function rubles(amount) {
        const ones = [['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'], ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']];
        const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
        const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
        const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
        const units = [['рубль', 'рубля', 'рублей', 0], ['тысяча', 'тысячи', 'тысяч', 1], ['миллион', 'миллиона', 'миллионов', 0], ['миллиард', 'миллиарда', 'миллиардов', 0]];
        const plural = (n, f) => { const a = n % 100; const b = n % 10; return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]; };
        const triad = (n, fem) => { const w = []; w.push(hundreds[Math.floor(n / 100)]); const t = n % 100; if (t >= 10 && t < 20) w.push(teens[t - 10]); else { w.push(tens[Math.floor(t / 10)]); w.push(ones[fem][t % 10]); } return w.filter(Boolean).join(' '); };
        const total = Math.round(Math.abs(Number(amount) || 0) * 100);
        let rub = Math.floor(total / 100);
        const kop = total % 100;
        if (!rub) return `Ноль рублей ${String(kop).padStart(2, '0')} копеек`;
        const parts = [];
        let i = 0;
        let rubWord = 'рублей';
        while (rub > 0 && i < units.length) {
            const n = rub % 1000;
            if (i === 0) rubWord = plural(n, units[0]);
            if (n) parts.unshift(`${triad(n, units[i][3])}${i ? ' ' + plural(n, units[i]) : ''}`);
            rub = Math.floor(rub / 1000);
            i++;
        }
        const s = `${parts.join(' ')} ${rubWord} ${String(kop).padStart(2, '0')} ${plural(kop, ['копейка', 'копейки', 'копеек'])}`;
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    return { FORMS, rowValues, tableTotal, check, rubles, party };
})();
