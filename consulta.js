/* Consulta documental determinística: apenas dados publicados, sem geração clínica. */
(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const displayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
  const notice = 'Consulta profissional: este sistema organiza informações documentais e regulatórias. Não substitui bula brasileira vigente, protocolos oficiais, julgamento clínico, validação médica independente ou prescrição individualizada.';
  const missing = 'Não localizei essa informação nas fontes e edições disponíveis no SiteGPT. É necessário consultar a bula brasileira vigente, a Anvisa, o protocolo oficial correspondente ou outra fonte primária adequada.';
  const doseMissing = 'A posologia não está suficientemente confirmada nos documentos disponíveis para esta data. É necessário conferir a bula brasileira vigente, o protocolo aplicável e a validação clínica independente.';
  const individualized = 'Posso explicar o que está documentado no relatório e nas fontes disponíveis, mas não posso substituir avaliação clínica, bula vigente, protocolo institucional ou validação médica independente. Para uma decisão individual, confira todos os dados do paciente e faça dupla checagem profissional.';
  const shortcuts = [
    'O que mudou na revisão mais recente?', 'Qual é a data do relatório consultado?',
    'O catálogo foi alterado?', 'Quais alertas de segurança foram encontrados?',
    'Quais pendências continuam abertas?', 'O que está documentado sobre semaglutida em adolescentes?',
    'O que foi encontrado sobre tirzepatida pediátrica?', 'Compare as revisões de 14/09/2026 e 15/09/2026.',
    'Quais são as fontes oficiais desta atualização?', 'Há uma posologia pediátrica confirmada para este medicamento?'
  ];
  const classifications = ['Mudança confirmada', 'Nova indicação', 'Nova apresentação', 'Alteração de posologia', 'Alerta de segurança', 'Descontinuação ou disponibilidade', 'Lacuna de cobertura', 'Pendência', 'Informação contextual', 'Não confirmado', 'Sem mudança confirmada'];
  function sourceType(source) {
    const institution = normalize(source.institution).trim();
    const foreignFDA = 'agência regulatória dos Estados Unidos; não equivale a aprovação brasileira';
    const foreignEMA = 'agência regulatória europeia; não equivale a aprovação brasileira';
    const international = 'organismo internacional; não equivale a aprovação brasileira';
    const complementary = 'fonte complementar; não equivale a aprovação brasileira';
    let host = '';
    try {
      const url = new URL(source.url);
      if (/^https?:$/.test(url.protocol)) host = url.hostname.toLowerCase().replace(/\.$/, '');
    } catch { /* Fontes históricas sem URL válida usam somente o nome institucional exato. */ }
    const belongsTo = domain => host === domain || host.endsWith('.' + domain);
    // A origem do link prevalece sobre nomes agregados; substring em título/URL não prova origem.
    if (belongsTo('fda.gov')) return foreignFDA;
    if (belongsTo('ema.europa.eu')) return foreignEMA;
    if (belongsTo('who.int')) return international;
    if (belongsTo('gov.br')) return 'fonte oficial brasileira';
    if (belongsTo('sbp.com.br')) return 'sociedade médica brasileira';
    if (!host) {
      if (/^(?:fda|(?:u\.s\.\s*)?food and drug administration)$/.test(institution)) return foreignFDA;
      if (/^(?:ema|european medicines agency|agencia europeia de medicamentos)$/.test(institution)) return foreignEMA;
      if (/^(?:oms|who|organizacao mundial da saude|world health organization)$/.test(institution)) return international;
      if (/^(?:anvisa|agencia nacional de vigilancia sanitaria|ministerio da saude|ms)$/.test(institution)) return 'fonte oficial brasileira';
      if (/^(?:sbp|sociedade brasileira de pediatria)$/.test(institution)) return 'sociedade médica brasileira';
    }
    return /\bbrasil\b/.test(institution) ? 'documento do fabricante no Brasil' : complementary;
  }
  const editionMetadata = {
    '2026-09-13': { edition: '2026-09-13', changed: false, confirmed: 0, status: 'Edição-base', carry: [] },
    '2026-09-14': { edition: '2026-09-13', changed: false, confirmed: 0, status: 'Catálogo preservado', carry: [] },
    '2026-09-15': { edition: '2026-09-13', changed: false, confirmed: 0, status: 'Catálogo preservado', carry: ['2026-09-14'] }
  };
  function localDate(now = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  function datesIn(text) {
    const matches = [];
    for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) matches.push(m[0]);
    for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) matches.push(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    const months = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    for (const m of normalize(text).matchAll(/\b(\d{1,2}) de ([a-z]+) de (\d{4})\b/g)) {
      const month = months.indexOf(m[2]);
      if (month >= 0) matches.push(`${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    }
    return [...new Set(matches)];
  }
  function createEngine(data, catalog = { items: [] }) {
    const keys = Object.keys(data).sort();
    function snapshot(key) {
      const report = data[key];
      if (!report) return null;
      const meta = report.catalogMetadata || editionMetadata[key] || { edition: 'Não informada nesta revisão', changed: null, confirmed: null, status: report.status, carry: [] };
      const direct = report.items.map(item => ({ item, date: key, carried: false }));
      const carried = (meta.carry || []).flatMap(date => (data[date]?.items || []).filter(item => (meta.carryTypes || ['pendencia']).includes(item.type)).map(item => ({ item, date, carried: true })));
      const seen = new Set(direct.map(x => normalize(x.item.drug + '|' + x.item.title)));
      return { key, report, ...meta, records: [...direct, ...carried.filter(x => { const id = normalize(x.item.drug + '|' + x.item.title); if (seen.has(id)) return false; seen.add(id); return true; })] };
    }
    function answer(question, options = {}) {
      const query = normalize(question).trim();
      const latest = keys.at(-1);
      let requested = datesIn(question);
      if (!requested.length && /\bhoje\b/.test(query)) requested = [options.today || localDate()];
      if (!requested.length && options.date && !/mais recente|ultima revisao/.test(query)) requested = [options.date];
      const comparison = /compar|diferenca entre/.test(query);
      if (comparison && requested.length < 2) {
        const upper = requested[0] || latest;
        const prior = keys.filter(key => key < upper).at(-1);
        requested = prior ? [prior, upper] : [upper];
      }
      const selected = requested.length ? requested : [latest];
      const absent = selected.filter(date => !data[date]);
      const result = { question, dates: selected, snapshots: [], kind: 'overview', message: '', records: [], monographs: [], notice, limitations: 'A consulta utiliza os relatórios publicados e seus vínculos documentais; não executa pesquisa nova nem comprova disponibilidade comercial. Datas de acesso das fontes são distintas das datas dos relatórios. O índice localiza nomes e páginas do PDF integral; o texto clínico de cada monografia deve ser consultado no próprio documento e não é automaticamente validado por esta busca.' };
      if (/manual integral|arquivo a\+{1,5}|fontes nexo/.test(query)) return { ...result, dates: [], kind: 'nexo-references', message: 'O Arquivo A+++++ e o Manual Integral estão disponíveis integralmente nos links NEXO abaixo. Orientam seleção clínica antes do cálculo, unidade original, checagens e tratamento explícito das lacunas. Esta consulta documental não libera automaticamente doses ou registros para prescrição.', limitations: 'Prioridade interna não é nível de evidência. Os documentos não constituem nova revisão diária nem validação independente de todas as posologias.' };
      if (!latest || absent.length) return { ...result, kind: 'missing-date', message: `Relatório não localizado: ${absent.map(displayDate).join(', ') || 'nenhum relatório disponível'}. Não há comprovação de execução nessas datas nos arquivos consultados.${latest ? ' Relatório mais recente disponível: ' + displayDate(latest) + '.' : ''}` };
      result.snapshots = selected.map(snapshot);
      if (comparison) return { ...result, kind: 'comparison', message: selected.length < 2 ? 'Não há revisão anterior disponível para esta comparação.' : 'Comparação documental: cada coluna conserva a data do relatório e a edição do PDF.' };
      const current = result.snapshots[0];
      const all = current.records;
      const doseRequest = /dose|posologia|prescri|calcule|calcular|diluicao|infusao|ml\/h|mg\/kg/.test(query);
      const patientRequest = doseRequest && /\b\d+(?:[.,]\d+)?\s*(?:kg|quilos|meses|anos|dias)\b|crianca de|meu paciente/.test(query);
      const redirect = patientRequest || /substitu|combin.*esquema|conduta emerg|diagnost|autoriza.*off.label|farmacia especifica|garant.*seguranca/.test(query);
      if (redirect) return { ...result, kind: 'individual', message: individualized, limitations: 'Dados a conferir conforme o caso: idade cronológica e gestacional/corrigida, peso atual, indicação, função renal e hepática, alergias, comorbidades, medicamentos concomitantes, apresentação e protocolo aplicável. Alta vigilância: dupla checagem humana de paciente, peso, medicamento, unidade, concentração, via, dose, diluição, velocidade, programação da bomba e cálculo final.' };
      if (/horario|agend|rotina|quando.*atualiz|meia.noite|manus/.test(query)) return { ...result, kind: 'schedule', message: 'Esta consulta apresenta os relatórios efetivamente publicados. Último relatório disponível: ' + displayDate(latest) + '.', limitations: 'Nenhum relatório de data ausente é presumido; a presença de uma revisão documental não comprova cobertura clínica integral.' };
      const aliases = { semaglutida: ['semaglutida','wegovy'], tirzepatida: ['tirzepatida','mounjaro'], liraglutida: ['liraglutida','saxenda'], infliximabe: ['infliximabe','remsima'], dobutamina: ['dobutamina','hypofarma'], 'agonistas de glp-1': ['glp-1','glp1','pancreatite','canetas'] };
      const drugs = Object.keys(aliases).filter(key => aliases[key].some(alias => query.includes(alias)));
      const stopWords = new Set(['qual','quais','sobre','como','esta','esse','essa','para','pode','voce','informe','explique','estao','onde','localize','pagina','dose','pediatrica','pediatrico','posologia','medicamento','documentado','catalogo','crianca','confirmada','indicado']);
      const searchTerms = query.split(/[^a-z0-9]+/).filter(word => word.length > 3 && !stopWords.has(word));
      result.monographs = (catalog.items || []).filter(item => {
        const name = normalize(item.name);
        return drugs.some(drug => name.includes(drug)) || (searchTerms.length && searchTerms.some(term => name.split(/[^a-z0-9]+/).includes(term)));
      }).slice(0, 20);
      const matched = all.filter(row => drugs.includes(normalize(row.item.drug)));
      if (drugs.length) {
        result.kind = doseRequest ? 'dose' : 'records'; result.records = matched;
        result.message = matched.length ? (doseRequest ? doseMissing : 'Não consta incorporação de nova ficha para este achado na revisão consultada. Os registros abaixo distinguem indicação regulatória, alerta, lacuna e pendência; o PDF-base permanece preservado.') : missing;
      } else if (doseRequest) {
        result.kind = 'dose'; result.message = doseMissing + ' Informe o nome do medicamento para localizar o registro documental correspondente; esta consulta não emite prescrição automática.';
      } else if (/alerta|risco|seguranca/.test(query)) {
        result.kind = 'records'; result.records = all.filter(row => row.item.type === 'alerta'); result.message = result.records.length ? 'Alertas documentados na data consultada; cada fonte está vinculada ao achado que sustenta.' : 'Nenhum alerta detalhado neste relatório. Isso não comprova ausência de riscos.';
      } else if (/penden|lacuna|abertas/.test(query)) {
        result.kind = 'records'; result.records = all.filter(row => /pendencia|lacuna/.test(row.item.type));
        result.message = 'Pendências e lacunas documentadas. Itens herdados de outra revisão têm a origem indicada. O total declarado no relatório pode incluir campos não individualizados nos registros disponíveis.';
      } else if (/fonte|referencia/.test(query)) {
        result.kind = 'sources'; result.records = all; result.message = 'Fontes vinculadas aos achados consultados. Literatura internacional é apoio contextual e não comprova aprovação, indicação ou disponibilidade no Brasil.';
      } else if (/data|relatorio|revisao|mudou|mudanca|catalogo|pdf|edicao|atualiz/.test(query)) {
        result.message = current.report.summary; result.records = all;
      } else {
        const terms = query.split(/\W+/).filter(term => term.length > 3 && !['qual','quais','sobre','como','esta','esse','essa','para','pode','voce','informe','explique','estao'].includes(term));
        result.records = all.filter(row => terms.length && terms.every(term => normalize(JSON.stringify(row.item)).includes(term)));
        result.kind = result.records.length ? 'records' : 'unknown'; result.message = result.records.length ? 'Registros documentais correspondentes à consulta:' : missing;
      }
      if (result.kind === 'unknown' && result.monographs.length) { result.kind = 'catalog'; result.message = 'Localizei as monografias abaixo no PDF-base disponível. Abra a página para consultar o conteúdo completo e as referências originais; a presença no catálogo não equivale a mudança confirmada nesta revisão.'; }
      return result;
    }
    return { answer, snapshot, latest: keys.at(-1) };
  }
  root.CatalogConsultation = { createEngine, shortcuts, classifications, localDate, datesIn, notice, displayDate };
  if (typeof document === 'undefined') return;
  const form = document.getElementById('consulta-form');
  if (!form || typeof reports === 'undefined') return;
  const engine = createEngine(reports, root.CatalogIndex);
  const output = document.getElementById('consulta-output');
  const field = document.getElementById('consulta-question');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const sourceHtml = row => itemSources(row.item).map(source => `<span class="consulta-source"><a href="${escape(source.url)}" target="_blank" rel="noopener"><strong>${escape(source.institution)} · ${escape(source.title)}</strong></a><br>Publicação/atualização: ${escape(source.published)} · Acesso registrado: ${escape(source.accessed)}<br>Tipo: ${sourceType(source)} · Sustenta o registro: ${escape(row.item.title)}<br>${escape(source.url)}</span>`).join('');
  const recordsHtml = rows => rows.map(row => `<article class="consulta-result"><span class="badge ${row.item.type === 'alerta' ? 'alert' : 'pending'}">${escape(row.item.badge)}</span><h4>${escape(row.item.drug)} · ${escape(row.item.title)}</h4><small>Origem: relatório de ${displayDate(row.date)}${row.carried ? ' · pendência mantida na revisão consultada' : ''}</small><p>${escape(row.item.text)}</p>${row.item.detail ? '<p>' + escape(row.item.detail) + '</p>' : ''}${row.item.classification ? '<p><strong>Classificação:</strong> ' + escape(row.item.classification) + '</p>' : ''}${row.item.pendingFields?.length ? '<ul>' + row.item.pendingFields.map(value => '<li>' + escape(value) + '</li>').join('') + '</ul>' : ''}${sourceHtml(row)}${row.item.copyReadyBlock ? `<div class="copy-ready-block"><h4>Orientação pronta para copiar</h4><pre>${escape(row.item.copyReadyBlock)}</pre><button type="button" class="btn secondary" onclick="copyPolicyBlock(this)">Copiar orientação</button><span role="status" aria-live="polite"></span></div>` : ''}</article>`).join('');
  function tableHtml(snapshots) {
    const rows = [
      ['Status do catálogo', s => s.status], ['Mudanças confirmadas', s => s.confirmed ?? 'Não informado'],
      ['PDF alterado', s => s.changed === false ? 'Não' : s.changed === true ? 'Sim' : 'Não informado'],
      ['Alertas', s => s.records.filter(x => x.item.type === 'alerta').map(x => x.item.title).join('; ') || 'Nenhum detalhado'],
      ['Pendências/lacunas', s => s.records.filter(x => x.item.type !== 'alerta').map(x => x.item.drug + (x.carried ? ' (origem ' + displayDate(x.date) + ')' : '')).join('; ') || 'Nenhuma detalhada'],
      ['Edição do PDF', s => displayDate(s.edition)]
    ];
    return '<div class="consulta-table-wrap"><table><thead><tr><th>Campo</th>' + snapshots.map(s => '<th>' + displayDate(s.key) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(([label, get]) => '<tr><th>' + label + '</th>' + snapshots.map(s => '<td>' + escape(get(s)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  function submit(question) {
    const result = engine.answer(question, { date: document.getElementById('consulta-date').value });
    const current = result.snapshots[0];
    output.innerHTML = '<h3>' + escape(question) + '</h3><div class="consulta-dates">' + result.dates.map(date => '<span class="badge">Data consultada: ' + escape(displayDate(date)) + '</span>').join('') + (current ? '<span class="badge">Edição do catálogo: ' + escape(displayDate(current.edition)) + '</span><span class="badge">' + escape(current.status) + '</span>' : '') + '</div><p>' + escape(result.message) + '</p>' + (result.kind === 'comparison' ? tableHtml(result.snapshots) + result.snapshots.map(s => '<h3>Fontes e registros — ' + displayDate(s.key) + '</h3>' + recordsHtml(s.records)).join('') : (result.kind === 'overview' && current ? '<p><strong>Mudanças confirmadas:</strong> ' + escape(current.confirmed ?? 'Não informado') + ' · <strong>PDF alterado:</strong> ' + (current.changed === false ? 'Não' : current.changed === true ? 'Sim' : 'Não informado') + '</p>' : '') + recordsHtml(result.records)) + (result.monographs.length ? '<h3>Monografias no PDF-base</h3><ul>' + result.monographs.map(item => '<li><a href="catalogo-base.pdf#page=' + item.page + '" target="_blank" rel="noopener">' + escape(item.name) + ' · ficha ' + item.id + ' · página ' + item.page + '</a></li>').join('') + '</ul>' : '') + '<p class="consulta-source"><strong>Base documental:</strong> ' + (current ? 'relatório(s) publicado(s) de ' + result.dates.map(displayDate).join(', ') + '; ' : '') + '<a href="fontes/prompt-mestre-complementar.pdf" target="_blank" rel="noopener">prompt mestre complementar, seções 1–20</a>. O PDF-base permanece disponível integralmente em <a href="catalogo-base.pdf" target="_blank" rel="noopener">Catálogo Posológico Pediátrico</a>.</p><p class="consulta-source"><strong>Referências NEXO:</strong> <a href="nexo/ARQUIVO_A_NEXO_Clinical_Nucleo_Global_Tratamentos.pdf" target="_blank" rel="noopener">Arquivo A+++++</a> · <a href="nexo/Manual_Integral_Prescricao_Pediatrica_Segura.pdf" target="_blank" rel="noopener">Manual Integral</a></p><p class="consulta-source"><strong>Limitações:</strong> ' + escape(result.limitations) + '</p><p class="consulta-notice">' + escape(notice) + '</p>';
  }
  const quick = document.getElementById('consulta-shortcuts');
  shortcuts.forEach(text => { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = () => { field.value = text; document.getElementById('consulta-date').value = ''; submit(text); }; quick.appendChild(button); });
  form.addEventListener('submit', event => { event.preventDefault(); if (field.value.trim()) submit(field.value.trim()); });
})(globalThis);
