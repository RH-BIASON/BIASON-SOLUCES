(function() {
  'use strict';

  const state = {
    sheetFile: null,
    sheetHeaders: [],
    sheetRows: [],
    detectedColumns: { cpf: '', name: '', registration: '' },
    xmlSources: [],
    xmlEntries: [],
    topFolders: new Set(),
    matchedReports: [],
    missingEmployees: [],
    unmatchedXmlGroups: [],
    activePreviewTab: 'comprovantes',
    sheetWarnings: [],
    xmlWarnings: [],
    runWarnings: []
  };

  const HEADER_ALIASES = {
    cpf: ['cpf', 'nrcpf', 'cpfempregado', 'cpffuncionario', 'cpfcolaborador', 'cpfbeneficiario', 'documento', 'doc'],
    name: ['nome', 'funcionario', 'colaborador', 'empregado', 'beneficiario', 'nomefuncionario', 'nomecolaborador', 'nomecompleto'],
    registration: ['matricula', 'matriculafuncional', 'registro', 'codigo', 'codigofuncionario', 'identificador', 'id', 'cadastro']
  };

  const sheetInput = document.getElementById('employeeSheet');
  const xmlInput = document.getElementById('xmlBundle');
  const sheetDropZone = document.getElementById('sheetDropZone');
  const xmlDropZone = document.getElementById('xmlDropZone');
  const matchField = document.getElementById('matchField');
  const manualTabs = document.querySelector('.manual-tabs');
  const fileListDiv = document.getElementById('fileList');
  const messagesDiv = document.getElementById('messages');
  const previewTabs = document.getElementById('previewTabs');
  const previewDiv = document.getElementById('preview');
  const debugPanel = document.getElementById('debugPanel');
  const generateBtn = document.getElementById('generateBtn');
  const printBtn = document.getElementById('printBtn');
  const exportReportBtn = document.getElementById('exportReportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const debugBtn = document.getElementById('debugBtn');
  const pagadoraNome = document.getElementById('pagadoraNome');
  const pagadoraInsc = document.getElementById('pagadoraInsc');
  const natureza = document.getElementById('natureza');
  const anoCal = document.getElementById('anoCal');
  const dataEmissao = document.getElementById('dataEmissao');
  const responsavel = document.getElementById('responsavel');
  const responsavelCPF = document.getElementById('responsavelCPF');
  const infoCompl = document.getElementById('infoCompl');

  const LOGO_SRC = 'brasao_receita.png';

  [pagadoraNome, natureza, responsavel].forEach((el) => {
    el.addEventListener('input', () => toUpperInPlace(el));
    el.addEventListener('blur', () => toUpperInPlace(el));
  });
  [pagadoraInsc, responsavelCPF].forEach((el) => {
    el.addEventListener('blur', () => maskDocInPlace(el));
  });

  initDate();
  updateFileList();
  updateMessages();

  function initDate() {
    dataEmissao.value = new Date().toISOString().slice(0, 10);
  }

  function toUpperInPlace(el) {
    if (!el) return;
    el.value = String(el.value || '').toUpperCase();
  }

  function maskDocInPlace(el) {
    if (!el) return;
    const digits = onlyDigits(el.value);
    if (!digits) return;
    el.value = formatDoc(digits);
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function formatCPF(raw) {
    const digits = onlyDigits(raw).padStart(11, '0').slice(-11);
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function formatCNPJ(raw) {
    const digits = onlyDigits(raw).padStart(14, '0').slice(-14);
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  function formatDoc(raw) {
    const digits = onlyDigits(raw);
    return digits.length <= 11 ? formatCPF(digits) : formatCNPJ(digits);
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeHeader(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function normalizeName(value) {
    return normalizeText(value).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeIdentifier(value) {
    return normalizeText(value).replace(/[^A-Z0-9]+/g, '');
  }

  function monthLabel(value) {
    return String(value).padStart(2, '0');
  }

  function compareEntries(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  }

  function uniqueStrings(list) {
    return Array.from(new Set((list || []).filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoneyField(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return day + '/' + month + '/' + year;
  }

  function elementChildren(node) {
    return Array.from(node.childNodes || []).filter((child) => child && child.nodeType === 1);
  }

  function setWarningBucket(bucket, warnings) {
    state[bucket] = uniqueStrings(warnings);
    updateMessages();
  }

  function allWarnings() {
    return uniqueStrings([].concat(state.sheetWarnings, state.xmlWarnings, state.runWarnings));
  }

  function updateMessages() {
    const warnings = allWarnings();
    if (warnings.length) {
      messagesDiv.textContent = warnings.join('\n');
      messagesDiv.classList.add('show');
    } else {
      messagesDiv.textContent = '';
      messagesDiv.classList.remove('show');
    }
  }

  function clearPreview() {
    previewDiv.innerHTML = '';
    if (previewTabs) previewTabs.hidden = true;
    printBtn.disabled = true;
    if (exportReportBtn) exportReportBtn.disabled = true;
    state.matchedReports = [];
    state.missingEmployees = [];
    state.unmatchedXmlGroups = [];
    state.activePreviewTab = 'comprovantes';
    state.runWarnings = [];
    updateMessages();
  }

  function hasPrintablePreview() {
    return !!(state.matchedReports.length || state.missingEmployees.length || state.unmatchedXmlGroups.length);
  }

  function setActiveManualTab(tabName) {
    document.querySelectorAll('[data-manual-tab]').forEach((button) => {
      const isActive = button.getAttribute('data-manual-tab') === tabName;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('[data-manual-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.getAttribute('data-manual-panel') === tabName);
    });
  }

  function setActivePreviewTab(tabName) {
    state.activePreviewTab = tabName === 'relatorio' ? 'relatorio' : 'comprovantes';
    if (previewTabs) {
      previewTabs.hidden = !hasPrintablePreview();
      previewTabs.querySelectorAll('[data-preview-tab]').forEach((button) => {
        const isActive = button.getAttribute('data-preview-tab') === state.activePreviewTab;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });
    }
    previewDiv.querySelectorAll('[data-preview-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.getAttribute('data-preview-panel') === state.activePreviewTab);
    });
  }

  function inferCompanyNameFromSource(fileName) {
    return String(fileName || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function maybeAutofillCompanyName() {
    if (pagadoraNome.value.trim()) return;
    if (state.xmlSources.length) {
      pagadoraNome.value = inferCompanyNameFromSource(state.xmlSources[0].name).toUpperCase();
    } else if (state.sheetFile) {
      pagadoraNome.value = inferCompanyNameFromSource(state.sheetFile.name).toUpperCase();
    }
  }

  function maybeAutofillFromXml() {
    const years = uniqueStrings(state.xmlEntries.map((entry) => String(entry.year)));
    const employerIds = uniqueStrings(state.xmlEntries.map((entry) => onlyDigits(entry.employerInsc)).filter(Boolean));
    if (!anoCal.value && years.length === 1) {
      anoCal.value = years[0];
    }
    if (!pagadoraInsc.value && employerIds.length === 1) {
      pagadoraInsc.value = formatDoc(employerIds[0]);
    }
    maybeAutofillCompanyName();
  }

  function updateFileList() {
    const detected = state.detectedColumns;
    const xmlSourceText = state.xmlSources.length
      ? state.xmlSources.map((item) => item.name + ' (' + item.xmlCount + ' XML)').join(', ')
      : 'Nenhuma origem de XML carregada';
    const html = [
      '<div class="file-kv">',
      '<div><strong>Planilha:</strong> ' + escapeHtml(state.sheetFile ? state.sheetFile.name : 'Nenhuma planilha carregada') + '</div>',
      '<div><strong>Colunas detectadas:</strong> CPF = ' + escapeHtml(detected.cpf || 'não encontrada') + ' | Nome = ' + escapeHtml(detected.name || 'não encontrada') + ' | Matrícula = ' + escapeHtml(detected.registration || 'não encontrada') + '</div>',
      '<div><strong>Linhas válidas da planilha:</strong> ' + escapeHtml(String(state.sheetRows.length || 0)) + '</div>',
      '<div><strong>Entradas XML:</strong> ' + escapeHtml(xmlSourceText) + '</div>',
      '<div><strong>XMLs válidos lidos:</strong> ' + escapeHtml(String(state.xmlEntries.length || 0)) + '</div>',
      '</div>'
    ];
    fileListDiv.innerHTML = html.join('');
  }

  function headerMatches(normHeader, aliases) {
    return aliases.some((alias) => normHeader === alias || normHeader.includes(alias));
  }

  function detectSheetColumns(headers) {
    const normalized = headers.map((header) => ({ original: header, norm: normalizeHeader(header) }));
    const pick = (aliases) => {
      for (const item of normalized) {
        if (headerMatches(item.norm, aliases)) return item.original;
      }
      return '';
    };
    return {
      cpf: pick(HEADER_ALIASES.cpf),
      name: pick(HEADER_ALIASES.name),
      registration: pick(HEADER_ALIASES.registration)
    };
  }

  function maybeGuessCpfFromRow(row) {
    for (const value of Object.values(row || {})) {
      const digits = onlyDigits(value);
      if (digits.length === 11) return digits;
    }
    return '';
  }

  function maybeGuessNameFromRow(row) {
    const values = Object.values(row || {})
      .map((value) => String(value || '').trim())
      .filter((value) => /[A-Za-zÀ-ÿ]/.test(value));
    values.sort((a, b) => b.length - a.length);
    return values[0] || '';
  }

  function buildSheetRows(rawRows, detected) {
    const rows = [];
    const warnings = [];
    const seen = new Set();
    rawRows.forEach((row, index) => {
      let cpf = detected.cpf ? onlyDigits(row[detected.cpf]) : '';
      let name = detected.name ? String(row[detected.name] || '').trim() : '';
      let registration = detected.registration ? String(row[detected.registration] || '').trim() : '';
      if (!cpf) cpf = maybeGuessCpfFromRow(row);
      if (!name) name = maybeGuessNameFromRow(row);
      if (cpf.length > 11) cpf = cpf.slice(-11);
      const nameNorm = normalizeName(name);
      const registrationNorm = normalizeIdentifier(registration);
      if (!(cpf || nameNorm || registrationNorm)) return;
      const key = cpf ? 'CPF:' + cpf : (registrationNorm ? 'REG:' + registrationNorm : 'NAME:' + nameNorm);
      if (seen.has(key)) {
        warnings.push('Linha ' + (index + 2) + ' da planilha duplicada para ' + key + '. Mantendo a primeira ocorrência.');
        return;
      }
      seen.add(key);
      rows.push({
        lineNumber: index + 2,
        raw: row,
        cpf,
        name,
        nameNorm,
        registration,
        registrationNorm
      });
    });
    return { rows, warnings };
  }

  async function loadEmployeeSheet(file) {
    if (typeof XLSX === 'undefined') {
      setWarningBucket('sheetWarnings', ['Biblioteca SheetJS não foi carregada. Abra o HTML com internet para ler .xlsx/.xls/.csv.']);
      return;
    }
    clearPreview();
    state.sheetFile = file;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error('Planilha sem abas.');
      const ws = workbook.Sheets[firstSheet];
      const headerRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
      if (!headerRows.length) throw new Error('Planilha vazia.');
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      const headers = (headerRows[0] || []).map((value) => String(value || '').trim()).filter(Boolean);
      const fallbackHeaders = rawRows.length ? Object.keys(rawRows[0]) : [];
      const detected = detectSheetColumns(headers.length ? headers : fallbackHeaders);
      const built = buildSheetRows(rawRows, detected);
      const warnings = built.warnings.slice();
      state.sheetHeaders = headers.length ? headers : fallbackHeaders;
      state.detectedColumns = detected;
      state.sheetRows = built.rows;
      if (!state.sheetRows.length) {
        warnings.push('Nenhuma linha útil de funcionário foi encontrada na planilha.');
      }
      if (!detected.cpf && !detected.name && !detected.registration) {
        warnings.push('Não consegui identificar automaticamente as colunas da planilha. Preciso pelo menos do cabeçalho exato de Nome, CPF ou Matrícula para ajustar o matching.');
      } else if (!detected.cpf) {
        warnings.push('Coluna de CPF não identificada na planilha. O sistema vai tentar o matching pelo nome normalizado.');
      }
      setWarningBucket('sheetWarnings', warnings);
      maybeAutofillCompanyName();
      updateFileList();
    } catch (error) {
      state.sheetHeaders = [];
      state.sheetRows = [];
      state.detectedColumns = { cpf: '', name: '', registration: '' };
      setWarningBucket('sheetWarnings', ['Erro ao ler a planilha: ' + error.message]);
      updateFileList();
    }
  }
  function extractTopFolder(path) {
    const parts = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }

  function getFirstText(root, names) {
    for (const name of names) {
      const nodes = root.getElementsByTagNameNS('*', name);
      for (let i = 0; i < nodes.length; i += 1) {
        const text = nodes[i].textContent;
        if (text && text.trim()) return text.trim();
      }
    }
    return '';
  }

  function parseMonthYearFromText(source) {
    const match = String(source || '').match(/(\d{2})(\d{4})/);
    if (match) {
      return { month: parseInt(match[1], 10), year: parseInt(match[2], 10) };
    }
    return { month: null, year: null };
  }

  function parseMonthYearFromXml(xmlDoc) {
    const per = getFirstText(xmlDoc, ['perApur', 'perRef', 'periodo', 'compet', 'ano', 'mes']);
    if (!per) return { month: null, year: null };
    let result = /^(\d{4})-(\d{2})/.exec(per);
    if (result) {
      return { year: parseInt(result[1], 10), month: parseInt(result[2], 10) };
    }
    result = /(?:^|[^0-9])(\d{2})(\d{4})(?:[^0-9]|$)/.exec(per);
    if (result) {
      return { month: parseInt(result[1], 10), year: parseInt(result[2], 10) };
    }
    const digits = String(per).replace(/\D+/g, '');
    if (digits.length === 6) {
      return { year: parseInt(digits.slice(0, 4), 10), month: parseInt(digits.slice(4), 10) };
    }
    return { month: null, year: null };
  }

  function inferNameFromFileName(fileName) {
    const base = String(fileName || '').replace(/\.[^.]+$/, '');
    const match = base.match(/(?:^|[^0-9])(\d{2})(\d{4})[_\s-]+(.+)/);
    const namePart = match ? match[3] : base;
    return namePart.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function inferNameFromPath(fullPath) {
    const parts = String(fullPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      const part = parts[index].replace(/\.[^.]+$/, '').trim();
      if (!part) continue;
      if (/^-?SEM MOVIMENTO$/i.test(part)) continue;
      if (/^(\d{2})(\d{4})$/.test(part)) continue;
      return part.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return inferNameFromFileName(parts[parts.length - 1] || fullPath);
  }

  function parseXmlPayload(fileName, fullPath, text) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'application/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('XML inválido.');
    }

    let { month, year } = parseMonthYearFromText(fullPath || fileName);
    if (!month || !year) {
      const inferred = parseMonthYearFromXml(xmlDoc);
      month = inferred.month;
      year = inferred.year;
    }
    if (!month || !year) {
      throw new Error('Não foi possível identificar mês/ano.');
    }
    if (month < 1 || month > 12) {
      throw new Error('Mês inválido detectado: ' + month + '.');
    }

    const cpf = onlyDigits(getFirstText(xmlDoc, ['cpfBenef', 'cpf', 'cpfTrab', 'cpfBeneficiario'])).slice(-11);
    const employerInsc = onlyDigits(getFirstText(xmlDoc, ['nrInsc']));
    const workerName = getFirstText(xmlDoc, ['nmBenef', 'nomeBenef', 'nmTrab', 'nomeTrab', 'nmBeneficiario']) || inferNameFromPath(fullPath);
    const registration = getFirstText(xmlDoc, ['matricula', 'matTrab', 'codMatricula', 'codTrab']);

    const totalsByTag = {};
    function accumulateValues(node) {
      elementChildren(node).forEach((child) => {
        const name = child.localName || String(child.tagName || '').split(':').pop();
        const textValue = String(child.textContent || '').trim();
        if (!textValue) return;
        const value = parseFloat(textValue.replace(',', '.'));
        if (!Number.isNaN(value)) {
          totalsByTag[name] = (totalsByTag[name] || 0) + value;
        }
      });
    }

    function signatureOfNode(node) {
      const parts = [];
      elementChildren(node).forEach((child) => {
        const name = child.localName || String(child.tagName || '').split(':').pop();
        const textValue = String(child.textContent || '').trim();
        if (!textValue) return;
        const value = parseFloat(textValue.replace(',', '.'));
        if (!Number.isNaN(value)) {
          parts.push(name + '=' + value);
        }
      });
      return parts.sort().join('|');
    }

    const seenSigs = new Set();
    const consolidList = xmlDoc.getElementsByTagNameNS('*', 'consolidApurMen');
    if (consolidList && consolidList.length > 0) {
      Array.from(consolidList).forEach((node) => {
        const signature = signatureOfNode(node);
        if (signature && !seenSigs.has(signature)) {
          seenSigs.add(signature);
          accumulateValues(node);
        }
      });
    } else {
      const totList = xmlDoc.getElementsByTagNameNS('*', 'totApurMen');
      Array.from(totList).forEach((node) => {
        const signature = signatureOfNode(node);
        if (signature && !seenSigs.has(signature)) {
          seenSigs.add(signature);
          accumulateValues(node);
        }
      });
    }

    const planRows = [];
    const planSaudeList = xmlDoc.getElementsByTagNameNS('*', 'planSaude');
    if (planSaudeList && planSaudeList.length > 0) {
      const seenPlans = new Set();
      Array.from(planSaudeList).forEach((planNode) => {
        const cnpjOper = getFirstText(planNode, ['cnpjOper']) || '';
        const regANS = getFirstText(planNode, ['regANS']) || '';
        const vlrSaudeTit = parseFloat((getFirstText(planNode, ['vlrSaudeTit']) || '0').replace(',', '.')) || 0;
        const vlrSaudeDep = parseFloat((getFirstText(planNode, ['vlrSaudeDep']) || '0').replace(',', '.')) || 0;
        const signature = [cnpjOper, regANS, vlrSaudeTit, vlrSaudeDep].join('|');
        if (!seenPlans.has(signature) && (cnpjOper || regANS || vlrSaudeTit || vlrSaudeDep)) {
          seenPlans.add(signature);
          planRows.push({ cnpjOper, regANS, vlrSaudeTit, vlrSaudeDep });
        }
      });
    }

    let pensaoSum = 0;
    let exclusivo14Sum = 0;
    let planSaudeInfoIR67Sum = 0;
    let dedDep13Sum = 0;
    try {
      const evtList = xmlDoc.getElementsByTagNameNS('*', 'evtIrrfBenef');
      const baseEvt = evtList && evtList.length > 0 ? evtList[0] : xmlDoc;
      const infoList = baseEvt.getElementsByTagNameNS('*', 'infoIR');
      Array.from(infoList).forEach((infoNode) => {
        const tp = getFirstText(infoNode, ['tpInfoIR']);
        const valor = parseFloat((getFirstText(infoNode, ['valor']) || '0').replace(',', '.')) || 0;
        if ((tp === '51' || tp === '52' || tp === '53') && valor > 0) {
          pensaoSum += valor;
        }
        if (tp === '14' && valor > 0) {
          exclusivo14Sum += valor;
        }
        if (tp === '67' && valor > 0) {
          planSaudeInfoIR67Sum += valor;
        }
      });
    } catch (error) {
      // infoIR é opcional
    }

    try {
      const evtList = xmlDoc.getElementsByTagNameNS('*', 'evtIrrfBenef');
      const baseEvt = evtList && evtList.length > 0 ? evtList[0] : xmlDoc;
      const dedNodes = baseEvt.getElementsByTagNameNS('*', 'dedDepen');
      const maps = { '11': new Map(), '12': new Map(), '13': new Map() };
      Array.from(dedNodes).forEach((dedNode) => {
        const tpRend = ((dedNode.getElementsByTagNameNS('*', 'tpRend')[0] || {}).textContent || '').trim();
        const depIRRFraw = ((dedNode.getElementsByTagNameNS('*', 'depIRRF')[0] || {}).textContent || '').trim().toUpperCase();
        const depIRRF = depIRRFraw || 'S';
        const cpfDep = ((dedNode.getElementsByTagNameNS('*', 'cpfDep')[0] || {}).textContent || '').trim();
        const value = parseFloat((((dedNode.getElementsByTagNameNS('*', 'vlrDedDep')[0] || {}).textContent || '0').trim()).replace(',', '.')) || 0;
        if (!(tpRend in maps) || !cpfDep || depIRRF !== 'S' || !(value > 0)) return;
        const current = maps[tpRend].get(cpfDep) || 0;
        if (value > current) maps[tpRend].set(cpfDep, value);
      });
      const sumMap = (map) => Array.from(map.values()).reduce((total, value) => total + value, 0);
      const sum11 = sumMap(maps['11']);
      const sum12 = sumMap(maps['12']);
      const sum13 = sumMap(maps['13']);
      const picked = sum13 > 0 ? sum13 : (sum12 > 0 ? sum12 : sum11);
      const bruto13Mes = totalsByTag['vlrRendTrib13'] || 0;
      const inss13Mes = totalsByTag['vlrPrevOficial13'] || 0;
      const ir13Mes = totalsByTag['vlrCR13Men'] || 0;
      if (bruto13Mes > 0 || inss13Mes > 0 || ir13Mes > 0) {
        dedDep13Sum += picked;
      }
    } catch (error) {
      // dedDepen é opcional
    }

    totalsByTag._pensaoSum = pensaoSum;
    totalsByTag._exclusivo14Sum = exclusivo14Sum;
    totalsByTag._planSaudeInfoIR67Sum = planSaudeInfoIR67Sum;
    totalsByTag._dedDep13Sum = dedDep13Sum;

    if (exclusivo14Sum > 0) {
      const rendTrib = totalsByTag.vlrRendTrib || 0;
      totalsByTag.vlrRendTrib = Math.max(0, rendTrib - exclusivo14Sum);
      totalsByTag.vlrRendExclusivo = (totalsByTag.vlrRendExclusivo || 0) + exclusivo14Sum;
    }

    return {
      fileName,
      fullPath,
      month,
      year,
      cpf,
      workerName,
      workerNameNorm: normalizeName(workerName),
      registration,
      registrationNorm: normalizeIdentifier(registration),
      employerInsc,
      raw: totalsByTag,
      planSaude: planRows
    };
  }

  async function loadZipFile(file, warnings) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.xml'));
    if (!entries.length) {
      warnings.push('O ZIP ' + file.name + ' não possui arquivos XML.');
      return 0;
    }
    for (const entry of entries) {
      const topFolder = extractTopFolder(entry.name);
      if (topFolder) state.topFolders.add(topFolder);
      try {
        const text = await entry.async('string');
        state.xmlEntries.push(parseXmlPayload(entry.name.split('/').pop(), entry.name, text));
      } catch (error) {
        warnings.push('Erro no XML ' + entry.name + ': ' + error.message);
      }
    }
    return entries.length;
  }

  async function loadXmlSources(files) {
    const fileArray = Array.from(files || []);
    const needsZipLibrary = fileArray.some((file) => String(file.name || '').toLowerCase().endsWith('.zip'));
    if (needsZipLibrary && typeof JSZip === 'undefined') {
      setWarningBucket('xmlWarnings', ['Biblioteca JSZip não foi carregada. Abra o HTML com internet para ler ZIPs de XML.']);
      return;
    }
    clearPreview();
    const warnings = [];
    state.xmlSources = [];
    state.xmlEntries = [];
    state.topFolders = new Set();
    for (const file of fileArray) {
      const lower = file.name.toLowerCase();
      try {
        if (lower.endsWith('.zip')) {
          const xmlCount = await loadZipFile(file, warnings);
          state.xmlSources.push({ name: file.name, type: 'zip', xmlCount });
        } else if (lower.endsWith('.xml')) {
          const text = await file.text();
          state.xmlEntries.push(parseXmlPayload(file.name, file.name, text));
          state.xmlSources.push({ name: file.name, type: 'xml', xmlCount: 1 });
        } else {
          warnings.push('Ignorando arquivo não suportado para XML: ' + file.name);
        }
      } catch (error) {
        warnings.push('Erro ao processar ' + file.name + ': ' + error.message);
      }
    }
    state.xmlEntries.sort(compareEntries);
    if (!state.xmlEntries.length) {
      warnings.push('Nenhum XML válido foi encontrado no pacote informado.');
    }
    setWarningBucket('xmlWarnings', warnings);
    maybeAutofillFromXml();
    updateFileList();
  }

  function buildXmlGroups(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      const key = entry.cpf
        ? 'CPF:' + entry.cpf
        : (entry.registrationNorm
          ? 'REG:' + entry.registrationNorm
          : (entry.workerNameNorm ? 'NAME:' + entry.workerNameNorm : 'FILE:' + normalizeIdentifier(entry.fileName)));
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          cpf: entry.cpf || '',
          name: entry.workerName || '',
          nameNorm: entry.workerNameNorm || '',
          registration: entry.registration || '',
          registrationNorm: entry.registrationNorm || '',
          employerInsc: entry.employerInsc || '',
          monthMap: new Map()
        };
        groups.set(key, group);
      }
      if (!group.cpf && entry.cpf) group.cpf = entry.cpf;
      if ((!group.name || group.name.length < entry.workerName.length) && entry.workerName) {
        group.name = entry.workerName;
        group.nameNorm = entry.workerNameNorm;
      }
      if (!group.registration && entry.registration) {
        group.registration = entry.registration;
        group.registrationNorm = entry.registrationNorm;
      }
      if (!group.employerInsc && entry.employerInsc) {
        group.employerInsc = entry.employerInsc;
      }
      const monthKey = entry.year + '-' + monthLabel(entry.month);
      group.monthMap.set(monthKey, entry);
    });
    return Array.from(groups.values())
      .map((group) => ({
        key: group.key,
        cpf: group.cpf,
        name: group.name,
        nameNorm: group.nameNorm,
        registration: group.registration,
        registrationNorm: group.registrationNorm,
        employerInsc: group.employerInsc,
        entries: Array.from(group.monthMap.values()).sort(compareEntries)
      }))
      .sort((a, b) => String(a.name || a.cpf).localeCompare(String(b.name || b.cpf), 'pt-BR'));
  }

  function buildGroupIndexes(groups) {
    const byCpf = new Map();
    const byName = new Map();
    const byRegistration = new Map();
    groups.forEach((group) => {
      if (group.cpf) byCpf.set(group.cpf, group);
      if (group.nameNorm) byName.set(group.nameNorm, group);
      if (group.registrationNorm) byRegistration.set(group.registrationNorm, group);
    });
    return { byCpf, byName, byRegistration };
  }

  function resolveEmployeeMatch(row, indexes, preference) {
    const attempts = [];
    const addAttempt = (type, key, label) => {
      if (!key) return;
      if (!attempts.some((item) => item.type === type && item.key === key)) {
        attempts.push({ type, key, label });
      }
    };
    if (preference === 'cpf') {
      addAttempt('cpf', row.cpf, 'CPF');
    } else if (preference === 'matricula') {
      addAttempt('registration', row.registrationNorm, 'Matrícula');
    } else if (preference === 'nome') {
      addAttempt('name', row.nameNorm, 'Nome');
    } else {
      addAttempt('cpf', row.cpf, 'CPF');
      addAttempt('registration', row.registrationNorm, 'Matrícula');
      addAttempt('name', row.nameNorm, 'Nome');
    }
    for (const attempt of attempts) {
      const map = attempt.type === 'cpf'
        ? indexes.byCpf
        : (attempt.type === 'registration' ? indexes.byRegistration : indexes.byName);
      if (map.has(attempt.key)) {
        return { group: map.get(attempt.key), matchedBy: attempt.label };
      }
    }
    return null;
  }

  function computeAggregate(entries) {
    const aggregateRaw = {};
    const planAgg = {};
    entries.forEach((entry) => {
      Object.keys(entry.raw || {}).forEach((key) => {
        aggregateRaw[key] = (aggregateRaw[key] || 0) + (entry.raw[key] || 0);
      });
      (entry.planSaude || []).forEach((plan) => {
        const key = (plan.cnpjOper || '') + '|' + (plan.regANS || '');
        if (!planAgg[key]) {
          planAgg[key] = {
            cnpjOper: plan.cnpjOper || '',
            regANS: plan.regANS || '',
            tit: 0,
            dep: 0
          };
        }
        planAgg[key].tit += plan.vlrSaudeTit || 0;
        planAgg[key].dep += plan.vlrSaudeDep || 0;
      });
    });
    const planAggList = Object.values(planAgg).filter((item) => (item.cnpjOper || item.regANS) && ((item.tit || 0) + (item.dep || 0) > 0));
    return {
      aggregateRaw,
      planAggList,
      calculations: calculateComprovanteValues(aggregateRaw, planAggList)
    };
  }

  function calculateComprovanteValues(aggregateRaw, planAggList) {
    const totalRendTrib = aggregateRaw.vlrRendTrib || 0;
    const totalPrevRegular = aggregateRaw.vlrPrevOficial || 0;
    const totalPensao = aggregateRaw._pensaoSum || 0;
    const totalPrev13 = aggregateRaw.vlrPrevOficial13 || 0;
    const totalIRRegular = aggregateRaw.vlrCRMen || 0;
    const totalIR13 = aggregateRaw.vlrCR13Men || 0;
    const totalRend13 = aggregateRaw.vlrRendTrib13 || 0;
    const totalDedDep13 = aggregateRaw._dedDep13Sum || 0;
    const totalPlanSaudeInfoIR67 = aggregateRaw._planSaudeInfoIR67Sum || 0;
    const totalPlanSaudeOperadoras = planAggList.reduce((sum, item) => sum + (item.tit || 0) + (item.dep || 0), 0);
    const net13 = totalRend13 - totalPrev13 - totalIR13 - totalDedDep13;
    const isentos = {
      row1: aggregateRaw.vlrParcIsenta65 || 0,
      row2: aggregateRaw.vlrParcIsenta65Dec || 0,
      row3: (aggregateRaw.vlrDiarias || 0) + (aggregateRaw.vlrAjudaCusto || 0),
      row4: (aggregateRaw.vlrIndResContrato || 0) + (aggregateRaw.vlrAbonoPec || 0),
      row5: (aggregateRaw.vlrRendMoleGrave || 0) + (aggregateRaw.vlrRendMoleGrave13 || 0),
      row6: aggregateRaw.vlrAuxMoradia || 0,
      row7: (aggregateRaw.vlrBolsaMedico || 0) + (aggregateRaw.vlrBolsaMedico13 || 0),
      row8: (aggregateRaw.vlrJurosMora || 0) + (aggregateRaw.vlrIsenOutros || 0)
    };
    const exclusivoOutros = (aggregateRaw.vlrRendExclusivo || 0) + (aggregateRaw.vlrOutros || 0) + (aggregateRaw.vlrRendExc || 0);
    return {
      totalRendTrib,
      totalPrevRegular,
      totalPensao,
      totalPrev13,
      totalIRRegular,
      totalIR13,
      totalRend13,
      totalDedDep13,
      totalPlanSaudeInfoIR67,
      totalPlanSaudeOperadoras,
      net13,
      isentos,
      exclusivoOutros
    };
  }

  function detectInternalMissingMonths(entries) {
    if (!entries || entries.length < 2) return [];
    const sorted = entries.slice().sort(compareEntries);
    const gaps = [];
    for (let index = 0; index < sorted.length - 1; index += 1) {
      let year = sorted[index].year;
      let month = sorted[index].month;
      while (true) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        if (year === sorted[index + 1].year && month === sorted[index + 1].month) break;
        gaps.push({ year, month });
        if (gaps.length > 24) return gaps;
      }
    }
    return gaps;
  }

  function buildEmployeeReport(row, matchInfo) {
    const group = matchInfo.group;
    const aggregate = computeAggregate(group.entries);
    const yearList = uniqueStrings(group.entries.map((entry) => String(entry.year)));
    const manualYear = anoCal.value.trim();
    const defaultYear = /^[0-9]{4}$/.test(manualYear)
      ? Number(manualYear)
      : (yearList.length === 1 ? Number(yearList[0]) : Number(yearList[0] || 0));
    return {
      employee: {
        name: row.name || group.name || inferNameFromFileName(group.entries[0] ? group.entries[0].fileName : ''),
        cpf: row.cpf || group.cpf || '',
        registration: row.registration || group.registration || '',
        lineNumber: row.lineNumber
      },
      matchedBy: matchInfo.matchedBy,
      employerInsc: group.employerInsc || '',
      entries: group.entries.slice().sort(compareEntries),
      aggregateRaw: aggregate.aggregateRaw,
      planAggList: aggregate.planAggList,
      calculations: aggregate.calculations,
      monthsLabel: group.entries.map((entry) => monthLabel(entry.month) + '/' + entry.year).join(', '),
      internalMissingMonths: detectInternalMissingMonths(group.entries),
      yearList,
      defaultYear
    };
  }

  function buildSummaryHtml() {
    const totalEmployees = state.sheetRows.length;
    const matchedCount = state.matchedReports.length;
    const missingCount = state.missingEmployees.length;
    const extraCount = state.unmatchedXmlGroups.length;
    const reportMap = new Map();
    state.matchedReports.forEach((report) => {
      const key = report.employee.cpf
        ? 'CPF:' + report.employee.cpf
        : (normalizeIdentifier(report.employee.registration)
          ? 'REG:' + normalizeIdentifier(report.employee.registration)
          : 'NAME:' + normalizeName(report.employee.name));
      reportMap.set(key, report);
    });
    const parts = [];
    parts.push('<div class="summary-section no-print">');
    parts.push('<div class="summary-strip">');
    parts.push('<div class="summary-card"><span>Total na planilha</span><strong>' + escapeHtml(String(totalEmployees)) + '</strong></div>');
    parts.push('<div class="summary-card"><span>Com XML</span><strong>' + escapeHtml(String(matchedCount)) + '</strong></div>');
    parts.push('<div class="summary-card"><span>Sem XML</span><strong>' + escapeHtml(String(missingCount)) + '</strong></div>');
    parts.push('<div class="summary-card"><span>XML sem planilha</span><strong>' + escapeHtml(String(extraCount)) + '</strong></div>');
    parts.push('</div>');
    if (state.sheetRows.length) {
      parts.push('<table class="employee-status-table">');
      parts.push('<thead><tr><th>Status</th><th>Funcionário</th><th>CPF</th><th>Matrícula</th><th>Matching</th><th>Meses no XML</th><th>Rend. tributáveis</th></tr></thead>');
      parts.push('<tbody>');
      state.sheetRows.forEach((row) => {
        const key = row.cpf ? 'CPF:' + row.cpf : (row.registrationNorm ? 'REG:' + row.registrationNorm : 'NAME:' + row.nameNorm);
        const report = reportMap.get(key);
        const statusClass = report ? 'status-ok' : 'status-missing';
        const statusText = report ? 'Com XML' : 'Sem XML';
        parts.push('<tr>');
        parts.push('<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>');
        parts.push('<td>' + escapeHtml(row.name || '(sem nome)') + '</td>');
        parts.push('<td>' + escapeHtml(row.cpf ? formatCPF(row.cpf) : '—') + '</td>');
        parts.push('<td>' + escapeHtml(row.registration || '—') + '</td>');
        parts.push('<td>' + escapeHtml(report ? report.matchedBy : '—') + '</td>');
        parts.push('<td>' + escapeHtml(report ? report.monthsLabel : '—') + '</td>');
        parts.push('<td>' + escapeHtml(report ? formatMoneyField(report.calculations.totalRendTrib) : '—') + '</td>');
        parts.push('</tr>');
      });
      parts.push('</tbody></table>');
    }
    if (state.unmatchedXmlGroups.length) {
      parts.push('<div class="empty-state"><strong>XMLs sem linha correspondente na planilha</strong><br>');
      parts.push(state.unmatchedXmlGroups.map((group) => {
        const employeeName = group.name || '(sem nome)';
        const cpfText = group.cpf ? ' | CPF: ' + formatCPF(group.cpf) : '';
        const months = group.entries.map((entry) => monthLabel(entry.month) + '/' + entry.year).join(', ');
        return escapeHtml(employeeName + cpfText + ' | Meses: ' + months);
      }).join('<br>'));
      parts.push('</div>');
    }
    parts.push('</div>');
    return parts.join('');
  }

  function summarizeMonthSpan(entries) {
    if (!entries || !entries.length) return '—';
    const sorted = entries.slice().sort(compareEntries);
    const labels = sorted.map((entry) => monthLabel(entry.month) + '/' + entry.year);
    if (labels.length === 1) return labels[0];
    if (!detectInternalMissingMonths(sorted).length) {
      return labels[0] + ' a ' + labels[labels.length - 1];
    }
    if (labels.length <= 6) return labels.join(', ');
    return labels.slice(0, 6).join(', ') + ' +' + (labels.length - 6) + ' meses';
  }

  function buildPendingReportHtml() {
    const companyName = (pagadoraNome.value || inferCompanyNameFromSource((state.xmlSources[0] || {}).name || '')).toUpperCase().trim();
    const reportDate = dataEmissao.value ? formatDate(dataEmissao.value) : formatDate(new Date().toISOString().slice(0, 10));
    const sheetName = state.sheetFile ? state.sheetFile.name : '';
    const sourceList = state.xmlSources.map((item) => item.name).join(', ');
    const parts = [];
    parts.push('<section class="pending-report">');
    parts.push('<div class="pending-report__header">');
    parts.push('<div>');
    parts.push('<span class="pending-report__eyebrow">Relatório de pendências</span>');
    parts.push('<h2>Conferência de XML x planilha</h2>');
    parts.push('<p class="pending-report__context">Fonte: ' + escapeHtml(companyName || 'Não informada') + ' | Data: ' + escapeHtml(reportDate) + '</p>');
    parts.push('<p class="pending-report__context">Planilha: ' + escapeHtml(sheetName || 'Não informada') + ' | XML: ' + escapeHtml(sourceList || 'Não informado') + '</p>');
    parts.push('</div>');
    parts.push('<div class="pending-report__stats">');
    parts.push('<div class="pending-report__stat"><span>Sem XML</span><strong>' + escapeHtml(String(state.missingEmployees.length)) + '</strong></div>');
    parts.push('<div class="pending-report__stat"><span>Sem planilha</span><strong>' + escapeHtml(String(state.unmatchedXmlGroups.length)) + '</strong></div>');
    parts.push('</div>');
    parts.push('</div>');
    parts.push('<div class="pending-report__grid">');
    parts.push('<div class="pending-report__block pending-report__block--missing">');
    parts.push('<h3>Funcionários da planilha sem XML correspondente</h3>');
    if (state.missingEmployees.length) {
      parts.push('<div class="pending-report-list pending-report-list--missing">');
      state.missingEmployees.forEach((row) => {
        const meta = [];
        meta.push('Linha ' + (row.lineNumber || '—'));
        if (row.cpf) meta.push('CPF ' + formatCPF(row.cpf));
        if (row.registration) meta.push('Matrícula ' + row.registration);
        parts.push('<article class="pending-report-item">');
        parts.push('<strong class="pending-report-item__name">' + escapeHtml(row.name || '(sem nome)') + '</strong>');
        parts.push('<div class="pending-report-item__meta">' + escapeHtml(meta.join(' | ')) + '</div>');
        parts.push('</article>');
      });
      parts.push('</div>');
    } else {
      parts.push('<div class="empty-state">Nenhum funcionário da planilha ficou sem XML correspondente.</div>');
    }
    parts.push('</div>');

    parts.push('<div class="pending-report__block pending-report__block--extra">');
    parts.push('<h3>XMLs sem linha correspondente na planilha</h3>');
    if (state.unmatchedXmlGroups.length) {
      parts.push('<div class="pending-report-list pending-report-list--extra">');
      state.unmatchedXmlGroups.forEach((group) => {
        const meta = [];
        if (group.cpf) meta.push('CPF ' + formatCPF(group.cpf));
        meta.push(group.entries.length + ' XMLs');
        meta.push(summarizeMonthSpan(group.entries));
        parts.push('<article class="pending-report-item pending-report-item--extra">');
        parts.push('<strong class="pending-report-item__name">' + escapeHtml(group.name || '(sem nome)') + '</strong>');
        parts.push('<div class="pending-report-item__meta">' + escapeHtml(meta.join(' | ')) + '</div>');
        parts.push('</article>');
      });
      parts.push('</div>');
    } else {
      parts.push('<div class="empty-state">Nenhum XML ficou sem linha correspondente na planilha.</div>');
    }
    parts.push('</div>');
    parts.push('</div>');
    parts.push('</section>');
    return parts.join('');
  }

  function exportPendingReportExcel() {
    if (typeof XLSX === 'undefined') {
      setWarningBucket('runWarnings', uniqueStrings(state.runWarnings.concat(['SheetJS não foi carregado. Não foi possível exportar o relatório em Excel.'])));
      return;
    }
    if (!hasPrintablePreview()) {
      setWarningBucket('runWarnings', uniqueStrings(state.runWarnings.concat(['Gere o lote antes de exportar o relatório em Excel.'])));
      return;
    }

    const companyName = (pagadoraNome.value || inferCompanyNameFromSource((state.xmlSources[0] || {}).name || '')).toUpperCase().trim();
    const reportDate = dataEmissao.value ? formatDate(dataEmissao.value) : formatDate(new Date().toISOString().slice(0, 10));
    const workbook = XLSX.utils.book_new();
    const sourceList = state.xmlSources.map((item) => item.name).join(', ');

    const summaryRows = [
      ['Fonte pagadora', companyName || ''],
      ['Data do relatório', reportDate],
      ['Planilha', state.sheetFile ? state.sheetFile.name : ''],
      ['Pacote XML', sourceList],
      ['Funcionários sem XML', state.missingEmployees.length],
      ['XML sem planilha', state.unmatchedXmlGroups.length]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

    const missingRows = state.missingEmployees.length
      ? state.missingEmployees.map((row) => ({
          Linha: row.lineNumber || '',
          Funcionario: row.name || '',
          CPF: row.cpf ? formatCPF(row.cpf) : '',
          Matricula: row.registration || ''
        }))
      : [{ Observacao: 'Nenhum funcionário da planilha ficou sem XML correspondente.' }];
    const missingSheet = XLSX.utils.json_to_sheet(missingRows);
    XLSX.utils.book_append_sheet(workbook, missingSheet, 'Sem XML');

    const extraRows = state.unmatchedXmlGroups.length
      ? state.unmatchedXmlGroups.map((group) => ({
          Funcionario: group.name || '',
          CPF: group.cpf ? formatCPF(group.cpf) : '',
          Meses: group.entries.map((entry) => monthLabel(entry.month) + '/' + entry.year).join(', '),
          TotalXmls: group.entries.length
        }))
      : [{ Observacao: 'Nenhum XML ficou sem linha correspondente na planilha.' }];
    const extraSheet = XLSX.utils.json_to_sheet(extraRows);
    XLSX.utils.book_append_sheet(workbook, extraSheet, 'XML sem planilha');

    const safeCompany = normalizeText(companyName || 'empresa').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'empresa';
    const safeYear = /^[0-9]{4}$/.test(String(anoCal.value || '').trim()) ? String(anoCal.value).trim() : new Date().getFullYear();
    XLSX.writeFile(workbook, 'relatorio_pendencias_' + safeCompany + '_' + safeYear + '.xlsx');
  }

  function getCommonInfoLines() {
    return String(infoCompl.value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function renderMoneySection(parts, title, rows) {
    parts.push('<table class="comprovante-table">');
    parts.push('<tr class="heading"><td>' + title + '</td><td class="dirf-money-head">Em Reais</td></tr>');
    rows.forEach((row) => {
      parts.push('<tr><td>' + row.label + '</td><td class="dirf-money-col"><span class="dirf-money">' + formatMoneyField(row.value) + '</span></td></tr>');
    });
    parts.push('</table>');
  }

  function buildComprovanteHtml(report) {
    const calculations = report.calculations;
    const displayYear = /^[0-9]{4}$/.test(anoCal.value.trim()) ? anoCal.value.trim() : String(report.defaultYear || '');
    const pagNome = (pagadoraNome.value || inferCompanyNameFromSource((state.xmlSources[0] || {}).name || '')).toUpperCase().trim();
    const pagDoc = pagadoraInsc.value ? formatDoc(pagadoraInsc.value) : (report.employerInsc ? formatDoc(report.employerInsc) : '');
    const benNome = String(report.employee.name || '').toUpperCase().trim();
    const benDoc = report.employee.cpf ? formatCPF(report.employee.cpf) : '';
    const natVal = String(natureza.value || '').toUpperCase().trim();
    const respNome = String(responsavel.value || '').toUpperCase().trim();
    const respDoc = responsavelCPF.value ? formatCPF(responsavelCPF.value) : '';
    const quadro4OutrosValor = calculations.isentos.row2 + calculations.isentos.row6 + calculations.isentos.row7 + calculations.isentos.row8;
    const quadro4OutrosDetalhes = [];
    if (calculations.isentos.row2 > 0) quadro4OutrosDetalhes.push('parcela isenta do 13º salário de aposentadoria, reserva, reforma ou pensão (65 anos ou mais)');
    if (calculations.isentos.row6 > 0) quadro4OutrosDetalhes.push('auxílio-moradia');
    if (calculations.isentos.row7 > 0) quadro4OutrosDetalhes.push('bolsa de médico-residente');
    if (calculations.isentos.row8 > 0) quadro4OutrosDetalhes.push('demais rendimentos isentos');
    const quadro4OutrosLabel = quadro4OutrosDetalhes.length
      ? '07-Outros (especificar): ' + escapeHtml(quadro4OutrosDetalhes.join('; '))
      : '07-Outros (especificar): vide quadro 06';
    const responsavelInfo = respNome
      ? escapeHtml(respNome) + (respDoc ? '<span class="dirf-inline-note">CPF: ' + escapeHtml(respDoc) + '</span>' : '')
      : (respDoc ? 'CPF: ' + escapeHtml(respDoc) : '&nbsp;');

    const infoLines = getCommonInfoLines();
    if (calculations.totalIR13 > 0) infoLines.push('IRRF sobre 13º salário: ' + formatMoneyField(calculations.totalIR13));
    if (calculations.totalDedDep13 > 0) infoLines.push('Dedução de dependentes aplicada ao 13º salário: ' + formatMoneyField(calculations.totalDedDep13));
    if (quadro4OutrosValor > 0) infoLines.push('Outros rendimentos isentos agrupados no item 07 do quadro 4: ' + formatMoneyField(quadro4OutrosValor));
    const useInfoIR67AsSinglePlan = report.planAggList.length === 1 && calculations.totalPlanSaudeInfoIR67 > calculations.totalPlanSaudeOperadoras + 0.005;
    report.planAggList.forEach((plan, index) => {
      const cnpjFmt = plan.cnpjOper ? formatDoc(plan.cnpjOper) : 'não informado';
      const reg = plan.regANS ? ' | ANS: ' + plan.regANS : '';
      const total = useInfoIR67AsSinglePlan && index === 0
        ? calculations.totalPlanSaudeInfoIR67
        : (plan.tit || 0) + (plan.dep || 0);
      infoLines.push('Plano de saúde - operadora ' + cnpjFmt + reg + ' | Valor: ' + formatMoneyField(total));
    });
    if ((!report.planAggList.length && calculations.totalPlanSaudeInfoIR67 > 0) ||
        (report.planAggList.length > 1 && calculations.totalPlanSaudeInfoIR67 > calculations.totalPlanSaudeOperadoras + 0.005)) {
      infoLines.push('Plano de saúde - total apurado no XML | Valor: ' + formatMoneyField(calculations.totalPlanSaudeInfoIR67));
    }
    const infoHTML = infoLines.length
      ? infoLines.map((line) => '<div class="dirf-note-line">' + escapeHtml(line) + '</div>').join('')
      : '<div class="dirf-note-line">&nbsp;</div>';

    const parts = [];
    parts.push('<section class="employee-report">');
    parts.push('<div class="report-note screen-only"><strong>' + escapeHtml(benNome || '(SEM NOME)') + '</strong>' + (benDoc ? ' | CPF: ' + escapeHtml(benDoc) : '') + (report.employee.registration ? ' | Matrícula: ' + escapeHtml(report.employee.registration) : '') + ' | Matching: ' + escapeHtml(report.matchedBy) + ' | Meses no XML: ' + escapeHtml(report.monthsLabel) + '</div>');
    parts.push('<div class="comprovante">');
    parts.push('<table class="comprovante-table rfb-header">');
    parts.push('<tr>');
    parts.push('<td class="rfb-logo-cell"><img alt="Brasão da República Federativa do Brasil" src="' + escapeHtml(LOGO_SRC) + '"></td>');
    parts.push('<td class="rfb-center"><div class="dirf-header-org">MINISTÉRIO DA FAZENDA<br>SECRETARIA DA RECEITA FEDERAL</div><div class="dirf-header-title">COMPROVANTE DE RENDIMENTOS PAGOS E DE<br>RETENÇÃO DE IMPOSTO DE RENDA NA FONTE</div></td>');
    parts.push('<td class="rfb-right"><span class="dirf-field-label">ANO-CALENDÁRIO</span><span class="dirf-field-value">' + escapeHtml(displayYear || '') + '</span></td>');
    parts.push('</tr>');
    parts.push('</table>');

    parts.push('<table class="comprovante-table">');
    parts.push('<tr class="heading"><td colspan="2">1-FONTE PAGADORA PESSOA FÍSICA OU PESSOA JURÍDICA</td></tr>');
    parts.push('<tr><td><span class="dirf-field-label">EMPRESA</span><span class="dirf-field-value">' + (pagNome ? escapeHtml(pagNome) : '&nbsp;') + '</span></td><td><span class="dirf-field-label">CNPJ/CPF</span><span class="dirf-field-value mono">' + (pagDoc ? escapeHtml(pagDoc) : '&nbsp;') + '</span></td></tr>');
    parts.push('</table>');

    parts.push('<table class="comprovante-table">');
    parts.push('<tr class="heading"><td colspan="2">2-PESSOA FÍSICA BENEFICIÁRIA DOS RENDIMENTOS</td></tr>');
    parts.push('<tr><td><span class="dirf-field-label">CPF</span><span class="dirf-field-value mono">' + (benDoc ? escapeHtml(benDoc) : '&nbsp;') + '</span></td><td><span class="dirf-field-label">NOME</span><span class="dirf-field-value">' + (benNome ? escapeHtml(benNome) : '&nbsp;') + '</span></td></tr>');
    parts.push('<tr><td colspan="2"><span class="dirf-field-label">NATUREZA DO RENDIMENTO</span><span class="dirf-field-value">' + (natVal ? escapeHtml(natVal) : '&nbsp;') + '</span></td></tr>');
    parts.push('</table>');

    renderMoneySection(parts, '3-RENDIMENTOS TRIBUTÁVEIS, DEDUÇÕES E IMPOSTO RETIDO NA FONTE', [
      { label: '01-Total dos Rendimentos (inclusive Férias):', value: calculations.totalRendTrib },
      { label: '02-Contribuição Previdenciária Oficial:', value: calculations.totalPrevRegular },
      { label: '03-Contribuição à Previdência Privada e ao Fundo de Aposentadoria Programada Individual - FAPI:', value: 0 },
      { label: '04-Pensão Alimentícia (informar o beneficiário no quadro 06):', value: calculations.totalPensao },
      { label: '05-Imposto de Renda Retido:', value: calculations.totalIRRegular }
    ]);

    renderMoneySection(parts, '4-RENDIMENTOS ISENTOS E NÃO TRIBUTÁVEIS', [
      { label: '01-Parcela Isenta dos Proventos de Aposentadoria, Reserva, Reforma e Pensão (65 anos ou mais):', value: calculations.isentos.row1 },
      { label: '02-Diárias e Ajudas de Custo:', value: calculations.isentos.row3 },
      { label: '03-Pensão, Proventos de Aposentadoria ou Reforma por Moléstia Grave e Aposentadoria ou Reforma por Acidente em Serviço:', value: calculations.isentos.row5 },
      { label: '04-Lucro e Dividendo Apurado a partir de 1996 pago por PJ (Lucro Real, Presumido ou Arbitrado):', value: 0 },
      { label: '05-Valores Pagos ao Titular ou Sócio da Microempresa ou Empresa de Pequeno Porte, exceto Pro-labore, Aluguéis ou Serviços Prestados:', value: 0 },
      { label: '06-Indenizações por rescisão de contrato de trabalho, inclusive a título de PDV, e acidente de trabalho:', value: calculations.isentos.row4 },
      { label: quadro4OutrosLabel, value: quadro4OutrosValor }
    ]);

    renderMoneySection(parts, '5-RENDIMENTOS SUJEITOS À TRIBUTAÇÃO EXCLUSIVA', [
      { label: '01-Décimo Terceiro Salário:', value: calculations.net13 },
      { label: '02-Outros:', value: calculations.exclusivoOutros }
    ]);

    parts.push('<table class="comprovante-table">');
    parts.push('<tr class="heading"><td>6-INFORMAÇÕES COMPLEMENTARES</td></tr>');
    parts.push('<tr><td class="dirf-note-cell">' + infoHTML + '</td></tr>');
    parts.push('</table>');

    parts.push('<table class="comprovante-table">');
    parts.push('<tr class="heading"><td colspan="3">7-RESPONSÁVEL PELAS INFORMAÇÕES</td></tr>');
    parts.push('<tr><td><span class="dirf-field-label">NOME</span></td><td><span class="dirf-field-label">DATA</span></td><td><span class="dirf-field-label">ASSINATURA</span></td></tr>');
    parts.push('<tr class="signature-row"><td><span class="dirf-field-value">' + responsavelInfo + '</span></td><td><span class="dirf-field-value">' + (dataEmissao.value ? escapeHtml(formatDate(dataEmissao.value)) : '&nbsp;') + '</span></td><td><span class="signature-value">&nbsp;</span></td></tr>');
    parts.push('</table>');

    parts.push('<table class="comprovante-table comprovante-footer">');
    parts.push('<tr><td>Aprovado pela IN/SRF nº 120/2000.</td></tr>');
    parts.push('</table>');
    parts.push('</div>');
    parts.push('</section>');
    return parts.join('');
  }

  function renderPreview() {
    const comprovanteSections = [];
    comprovanteSections.push(buildSummaryHtml());
    if (state.matchedReports.length) {
      state.matchedReports.forEach((report) => {
        comprovanteSections.push(buildComprovanteHtml(report));
      });
    } else {
      comprovanteSections.push('<div class="empty-state no-print">Nenhum comprovante disponível para impressão.</div>');
    }
    const reportSection = buildPendingReportHtml();
    previewDiv.innerHTML = [
      '<div class="preview-tab-panel" data-preview-panel="comprovantes">',
      comprovanteSections.join(''),
      '</div>',
      '<div class="preview-tab-panel" data-preview-panel="relatorio">',
      reportSection,
      '</div>'
    ].join('');
    printBtn.disabled = !hasPrintablePreview();
    if (exportReportBtn) exportReportBtn.disabled = !hasPrintablePreview();
    setActivePreviewTab(state.matchedReports.length ? state.activePreviewTab : 'relatorio');
  }

  function renderDebug(groups) {
    const debugObj = {
      planilha: {
        arquivo: state.sheetFile ? state.sheetFile.name : '',
        headers: state.sheetHeaders,
        colunasDetectadas: state.detectedColumns,
        linhasValidas: state.sheetRows.map((row) => ({
          linha: row.lineNumber,
          nome: row.name,
          cpf: row.cpf,
          matricula: row.registration
        }))
      },
      xml: {
        fontes: state.xmlSources,
        totalEntradas: state.xmlEntries.length,
        grupos: groups.map((group) => ({
          chave: group.key,
          nome: group.name,
          cpf: group.cpf,
          matricula: group.registration,
          meses: group.entries.map((entry) => monthLabel(entry.month) + '/' + entry.year),
          arquivos: group.entries.map((entry) => entry.fullPath)
        }))
      },
      resultado: {
        matchedReports: state.matchedReports.map((report) => ({
          nome: report.employee.name,
          cpf: report.employee.cpf,
          matricula: report.employee.registration,
          matchedBy: report.matchedBy,
          months: report.monthsLabel,
          totalRendTrib: report.calculations.totalRendTrib,
          totalIRRegular: report.calculations.totalIRRegular
        })),
        missingEmployees: state.missingEmployees.map((row) => ({
          linha: row.lineNumber,
          nome: row.name,
          cpf: row.cpf,
          matricula: row.registration
        })),
        unmatchedXmlGroups: state.unmatchedXmlGroups.map((group) => ({
          nome: group.name,
          cpf: group.cpf,
          matricula: group.registration,
          meses: group.entries.map((entry) => monthLabel(entry.month) + '/' + entry.year)
        }))
      },
      warnings: allWarnings()
    };
    debugPanel.textContent = JSON.stringify(debugObj, null, 2);
  }

  function generateBatch() {
    const blocking = [];
    const warnings = [];
    if (typeof XLSX === 'undefined') blocking.push('SheetJS não foi carregado. Abra o HTML com internet para ler a planilha.');
    if (!state.sheetRows.length) blocking.push('Carregue a planilha de funcionários antes de gerar o lote.');
    if (!state.xmlEntries.length) blocking.push('Carregue o ZIP ou os XMLs antes de gerar o lote.');
    if (anoCal.value.trim() && !/^[0-9]{4}$/.test(anoCal.value.trim())) blocking.push('Informe o ano-calendário com 4 dígitos.');
    if (blocking.length) {
      setWarningBucket('runWarnings', blocking);
      previewDiv.innerHTML = '';
      printBtn.disabled = true;
      return;
    }

    const groups = buildXmlGroups(state.xmlEntries);
    const indexes = buildGroupIndexes(groups);
    const usedKeys = new Set();
    const matchedReports = [];
    const missingEmployees = [];
    state.sheetRows.forEach((row) => {
      const match = resolveEmployeeMatch(row, indexes, matchField.value);
      if (match) {
        usedKeys.add(match.group.key);
        matchedReports.push(buildEmployeeReport(row, match));
      } else {
        missingEmployees.push(row);
      }
    });
    const unmatchedXmlGroups = groups.filter((group) => !usedKeys.has(group.key));

    matchedReports.sort((a, b) => String(a.employee.name || a.employee.cpf).localeCompare(String(b.employee.name || b.employee.cpf), 'pt-BR'));
    missingEmployees.sort((a, b) => String(a.name || a.cpf).localeCompare(String(b.name || b.cpf), 'pt-BR'));
    unmatchedXmlGroups.sort((a, b) => String(a.name || a.cpf).localeCompare(String(b.name || b.cpf), 'pt-BR'));

    state.matchedReports = matchedReports;
    state.missingEmployees = missingEmployees;
    state.unmatchedXmlGroups = unmatchedXmlGroups;

    if (!matchedReports.length) warnings.push('Nenhum funcionário da planilha foi associado aos XMLs.');
    if (matchField.value === 'cpf' && !state.detectedColumns.cpf) warnings.push('Matching por CPF selecionado, mas a planilha não teve coluna de CPF detectada automaticamente.');
    if (matchField.value === 'matricula') warnings.push('Os XMLs S-5002 normalmente não trazem matrícula. Use CPF ou nome se o matching por matrícula não encontrar resultados.');
    if (missingEmployees.length) warnings.push('Funcionários sem XML identificado: ' + missingEmployees.length + '.');
    if (unmatchedXmlGroups.length) warnings.push('Grupos de XML sem linha correspondente na planilha: ' + unmatchedXmlGroups.length + '.');

    setWarningBucket('runWarnings', warnings);
    renderPreview();
    renderDebug(groups);
  }

  function handleSheetFiles(fileList) {
    const files = Array.from(fileList || []);
    const file = files.find((item) => /\.(xlsx|xls|csv)$/i.test(item.name));
    if (!file) {
      setWarningBucket('sheetWarnings', ['Selecione uma planilha .xlsx, .xls ou .csv.']);
      return;
    }
    loadEmployeeSheet(file);
  }

  function handleXmlFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    loadXmlSources(files);
  }

  function setupDropZone(zone, handler) {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('hover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('hover');
    });
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('hover');
      handler(event.dataTransfer.files);
    });
  }

  function clearAll() {
    state.sheetFile = null;
    state.sheetHeaders = [];
    state.sheetRows = [];
    state.detectedColumns = { cpf: '', name: '', registration: '' };
    state.xmlSources = [];
    state.xmlEntries = [];
    state.topFolders = new Set();
    state.matchedReports = [];
    state.missingEmployees = [];
    state.unmatchedXmlGroups = [];
    state.sheetWarnings = [];
    state.xmlWarnings = [];
    state.runWarnings = [];
    pagadoraNome.value = '';
    pagadoraInsc.value = '';
    natureza.value = 'Trabalhador Assalariado';
    anoCal.value = '';
    initDate();
    responsavel.value = '';
    responsavelCPF.value = '';
    infoCompl.value = '';
    sheetInput.value = '';
    xmlInput.value = '';
    previewDiv.innerHTML = '';
    debugPanel.textContent = '';
    debugPanel.style.display = 'none';
    printBtn.disabled = true;
    updateFileList();
    updateMessages();
  }

  sheetDropZone.addEventListener('click', () => sheetInput.click());
  xmlDropZone.addEventListener('click', () => xmlInput.click());
  setupDropZone(sheetDropZone, handleSheetFiles);
  setupDropZone(xmlDropZone, handleXmlFiles);
  sheetInput.addEventListener('change', (event) => handleSheetFiles(event.target.files));
  xmlInput.addEventListener('change', (event) => handleXmlFiles(event.target.files));
  if (previewTabs) {
    previewTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-preview-tab]');
      if (!button) return;
      setActivePreviewTab(button.getAttribute('data-preview-tab'));
    });
  }
  if (manualTabs) {
    manualTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-manual-tab]');
      if (!button) return;
      setActiveManualTab(button.getAttribute('data-manual-tab'));
    });
    setActiveManualTab('como');
  }
  generateBtn.addEventListener('click', generateBatch);
  printBtn.addEventListener('click', () => window.print());
  if (exportReportBtn) exportReportBtn.addEventListener('click', exportPendingReportExcel);
  clearBtn.addEventListener('click', clearAll);
  debugBtn.addEventListener('click', () => {
    debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
  });
})();



