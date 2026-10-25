// Local stand-in for the Claude Messages API (streaming), for tests without a real key.
// Records every request body to test/.requests.jsonl; answers with text that names the received documents
// and cites the first one (page for PDF, quote for text), like the real API with citations enabled.
// Special prompts: «FAIL_529» — overloaded error; «JSON_EXTRACT» path is used by /extract (json_schema output).

import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.MOCK_PORT || 8790);
const LOG = new URL('./.requests.jsonl', import.meta.url);
fs.writeFileSync(LOG, '');

const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);

http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
        if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) { res.writeHead(404); res.end(); return; }
        const body = JSON.parse(raw);
        fs.appendFileSync(LOG, JSON.stringify({ headers: { beta: req.headers['anthropic-beta'], version: req.headers['anthropic-version'], key: req.headers['x-api-key'] || /^Bearer \S+/.test(req.headers.authorization || '') ? 'set' : 'missing' }, body }) + '\n');
        const last = body.messages[body.messages.length - 1];
        const texts = (Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }]).filter(b => b.type === 'text').map(b => b.text).join(' ');
        if (texts.includes('FAIL_529')) {
            res.writeHead(529, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }));
            return;
        }
        const docs = body.messages.flatMap(m => (Array.isArray(m.content) ? m.content : []).filter(b => b.type === 'document'));
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const usage = { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 800, cache_read_input_tokens: body.messages.length > 1 ? 800 : 0 };
        sse(res, 'message_start', { message: { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
        let index = 0;
        const textBlock = (text, citation) => {
            sse(res, 'content_block_start', { index, content_block: { type: 'text', text: '', ...(citation ? { citations: [] } : {}) } });
            if (citation) sse(res, 'content_block_delta', { index, delta: { type: 'citations_delta', citation } });
            for (const part of text.match(/.{1,40}/gs)) sse(res, 'content_block_delta', { index, delta: { type: 'text_delta', text: part } });
            sse(res, 'content_block_stop', { index });
            index++;
        };
        if (body.output_config && body.output_config.format) {
            textBlock(JSON.stringify({ contract: { number: '12/26', date: '2026-10-01', subject: 'Фундаменты', customer: 'Заказчик', contractor: 'Подрядчик', price: '10 000 000 руб.', start: '2026-10-05', end: '2027-03-01' }, obligations: [{ party: 'contractor', text: 'Передать исполнительную документацию', clause: '6.1', due: '', condition: 'в течение 5 рабочих дней после этапа' }] }));
        } else {
            const names = docs.map(d => d.title).join(', ') || 'нет';
            textBlock(`Ответ специалиста. Документы в запросе: ${names}.\n`);
            if (docs[0]) {
                const d = docs[0];
                const citation = d.source.media_type === 'application/pdf'
                    ? { type: 'page_location', cited_text: 'Clause 4.2 payment within 10 days', document_index: 0, document_title: d.title, start_page_number: 1, end_page_number: 2 }
                    : { type: 'char_location', cited_text: d.source.data.slice(0, 60), document_index: 0, document_title: d.title, start_char_index: 0, end_char_index: 60 };
                textBlock('Срок оплаты — 10 дней с даты подписания акта.', citation);
            }
            if (texts.includes('ПРОВЕРКА')) textBlock('\nТребует проверки: редакция нормы.');
        }
        sse(res, 'message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
        sse(res, 'message_stop', {});
        res.end();
    });
}).listen(PORT, '127.0.0.1', () => console.log(`mock anthropic on ${PORT}`));
