(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const metadata = window.COURSE_CATALOGUE_DATA?.courses || [];
  const data = window.PREREQUISITE_DATA || {};
  const catalogue = new Map(metadata.map(course => [course.code, course]));
  const verified = new Map((data.courses || []).map(course => [course.code, course]));
  const GROUPS = { group1: '第一组选修课', group2: '第二组选修课', internship: '实习' };
  const KINDS = { recommended: '建议先学（非强制）', required: '课程要求（知识/能力）', uncertain: '待确认' };
  const SHORT_STATUS = { none: '官方明确无强制先修', unspecified: '正式要求未公布', required: '有正式先修要求', conflict: '官方信息待确认' };
  const params = new URLSearchParams(location.search);
  if (params.get('embed') === '1') document.body.classList.add('is-embedded');
  const viewport = $('overview-viewport');
  const world = $('overview-world');
  const nodesHost = $('overview-nodes');
  const edgesHost = $('overview-edges');
  const expanded = new Set();
  const allNodes = new Map();
  const targetNodes = new Map();
  let visibleNodes = [];
  let dimensions = { width: 1, height: 1 };
  let view = { scale: 1, x: 0, y: 0 };
  let activeId = null;
  let matches = [];
  let matchIndex = -1;
  let searchTimer;
  let isFitView = true;
  let dragging = null;
  let suppressClick = false;
  const text = value => value == null ? '' : String(value);
  const normalise = value => text(value).toLowerCase().replace(/[\s-]+/g, '');
  function element(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value != null) el.textContent = value; return el; }
  function addNode(node, parent) { node.parent = parent || null; node.children = []; node.width = node.type === 'combination' ? 250 : 226; node.height = node.type === 'combination' ? 91 : 73; allNodes.set(node.id, node); if (parent) parent.children.push(node); return node; }
  function logicLabel(group, kind) {
    if (kind === 'uncertain' && group.logic === 'all') return '组合待确认 · 保留原文';
    if (group.logic === 'credits') return `累计至少 ${text(group.minPoints) || '指定'} 分${kind === 'recommended' ? '（建议）' : ''}`;
    if (group.logic === 'any') return 'OR · 任选其一';
    return kind === 'recommended' ? 'AND · 建议同时准备' : 'AND · 同时具备';
  }
  function addCombination(group, parent, index, lineage, inheritedKind) {
    const kind = group.kind || inheritedKind || 'uncertain';
    const node = addNode({ id: `${parent.id}/g${index}`, type: 'combination', kind, code: '', title: group.label || '准备组合', label: logicLabel(group, kind), info: group, ownerCode: parent.ownerCode || parent.code }, parent);
    expanded.add(node.id);
    (group.items || []).forEach((item, itemIndex) => {
      if (Array.isArray(item.items)) { addCombination(item, node, itemIndex, lineage, kind); return; }
      const code = text(item.code).trim();
      if (code && catalogue.has(code)) {
        const child = addCourse(code, node, `${node.id}/c${itemIndex}`, false, lineage, kind);
        child.itemNote = item.note || '';
      } else {
        addNode({ id: `${node.id}/i${itemIndex}`, type: code ? 'external' : 'knowledge', code, kind, title: item.text || code, info: item, ownerCode: node.ownerCode }, node);
      }
    });
    return node;
  }
  function addCourse(code, parent, id, target, lineage, kind) {
    const course = catalogue.get(code);
    const info = verified.get(code) || { formalStatus: 'unspecified', groups: [] };
    const cycle = lineage.includes(code);
    const node = addNode({ id, type: 'course', code, title: course.title, course, info, target, kind, ownerCode: code, cycle }, parent);
    if (target) targetNodes.set(code, node);
    if (!cycle) (info.groups || []).forEach((group, index) => addCombination(group, node, index, [...lineage, code]));
    return node;
  }
  const root = addNode({ id: 'root', type: 'root', code: 'MInfoTech · 180 分', title: '全课程先修与准备关系', label: '课程归组 → 目标课程 → 准备组合 → 基础' });
  root.width = 340; root.height = 95;
  Object.entries(GROUPS).forEach(([group, title]) => {
    const courses = metadata.filter(course => course.group === group);
    const branch = addNode({ id: `group-${group}`, type: 'group', group, code: title, title: `${courses.length} 门课程 · 点击聚焦`, label: '虚线仅表示课程归组', courseCount: courses.length }, root);
    branch.width = 290; branch.height = 84;
    courses.forEach(course => addCourse(course.code, branch, `course-${course.code.replace(/\s/g, '-')}`, true, []));
  });
  $('course-count').textContent = metadata.length;
  $('related-count').textContent = metadata.filter(course => (verified.get(course.code)?.groups || []).length).length;
  $('updated-at').textContent = text(data.updatedAt).slice(0, 10) || '未记录';
  $('visible-count').textContent = `${metadata.length} 门目标课程`;
  if (!metadata.length) { $('map-load-error').hidden = false; return; }
  function childrenOf(node) { return expanded.has(node.id) ? node.children : []; }
  function measure(node) {
    const children = childrenOf(node);
    children.forEach(measure);
    node.subHeight = Math.max(node.height, children.reduce((sum, child) => sum + child.subHeight, 0) + Math.max(0, children.length - 1) * 14);
    node.subWidth = node.width + (children.length ? 66 + Math.max(...children.map(child => child.subWidth)) : 0);
  }
  function position(node, x, y) {
    node.x = x; node.y = y + (node.subHeight - node.height) / 2;
    visibleNodes.push(node);
    const children = childrenOf(node);
    let nextY = y + (node.subHeight - (children.reduce((sum, child) => sum + child.subHeight, 0) + Math.max(0, children.length - 1) * 14)) / 2;
    children.forEach(child => { position(child, x + node.width + 66, nextY); nextY += child.subHeight + 14; });
  }
  function drawPath(path, kind = 'grouping', from, to) { const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('d', path); line.dataset.edgeKind = kind; if (from) line.dataset.from = from; if (to) line.dataset.to = to; edgesHost.appendChild(line); }
  function connectPreparation(node) {
    childrenOf(node).forEach(child => {
      const x1 = node.x + node.width, y1 = node.y + node.height / 2, x2 = child.x, y2 = child.y + child.height / 2, mid = x1 + 30;
      drawPath(`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, child.kind || node.kind || 'uncertain', node.id, child.id);
      connectPreparation(child);
    });
  }
  function render() {
    visibleNodes = [root];
    let nextX = 40, maxY = 0;
    edgesHost.replaceChildren(); nodesHost.replaceChildren();
    root.children.forEach(branch => {
      const columnCount = Math.max(1, Math.ceil(branch.children.length / 15));
      const perColumn = Math.ceil(branch.children.length / columnCount);
      const columns = Array.from({ length: columnCount }, (_, index) => branch.children.slice(index * perColumn, (index + 1) * perColumn));
      branch.startX = nextX;
      branch.columns = [];
      let branchBottom = 298;
      columns.forEach(column => {
        column.forEach(measure);
        const columnWidth = Math.max(226, ...column.map(node => node.subWidth));
        let nextY = 298;
        const rail = nextX;
        column.forEach(node => { position(node, nextX + 20, nextY); nextY += node.subHeight + 15; });
        branch.columns.push({ rail, nodes: column });
        branchBottom = Math.max(branchBottom, nextY);
        nextX += columnWidth + 56;
      });
      branch.endX = nextX - 30;
      branch.x = (branch.startX + branch.endX - branch.width) / 2;
      branch.y = 158;
      branch.bounds = { x: branch.startX - 8, y: 147, width: branch.endX - branch.startX + 30, height: branchBottom - 125 };
      visibleNodes.push(branch);
      maxY = Math.max(maxY, branchBottom);
      nextX += 100;
    });
    dimensions = { width: nextX - 76, height: maxY + 35 };
    root.x = (dimensions.width - root.width) / 2; root.y = 20;
    const rootBottom = root.y + root.height, rootMid = root.x + root.width / 2;
    root.children.forEach(branch => {
      const groupMid = branch.x + branch.width / 2;
      drawPath(`M ${rootMid} ${rootBottom} V 136 H ${groupMid} V ${branch.y}`, 'grouping', root.id, branch.id);
      branch.columns.forEach(column => {
        if (!column.nodes.length) return;
        column.nodes.forEach(node => { drawPath(`M ${groupMid} ${branch.y + branch.height} V 270 H ${column.rail} V ${node.y + node.height / 2} H ${node.x}`, 'grouping', branch.id, node.id); connectPreparation(node); });
      });
    });
    world.style.width = `${dimensions.width}px`; world.style.height = `${dimensions.height}px`;
    edgesHost.setAttribute('width', dimensions.width); edgesHost.setAttribute('height', dimensions.height);
    const fragment = document.createDocumentFragment();
    visibleNodes.forEach(node => fragment.appendChild(renderNode(node)));
    nodesHost.appendChild(fragment);
    $('visible-count').textContent = `${metadata.length} 门目标课程 · ${visibleNodes.length} 个节点`;
    viewport.dataset.targetCount = metadata.length;
    viewport.dataset.visibleNodeCount = visibleNodes.length;
    world.dataset.width = dimensions.width; world.dataset.height = dimensions.height;
    applyView();
  }
  function renderNode(node) {
    const card = element('div', 'map-node');
    card.dataset.nodeId = node.id; card.dataset.type = node.type;
    if (node.parent) card.dataset.parentId = node.parent.id;
    if (node.code) card.dataset.code = node.code;
    if (node.kind) card.dataset.kind = node.kind;
    if (node.group) card.dataset.group = node.group;
    if (node.target) card.dataset.group = node.course.group;
    if (node.type === 'combination') { card.dataset.logic = node.info.logic || 'all'; if (node.info.minPoints != null) card.dataset.minPoints = node.info.minPoints; }
    if (node.target) card.dataset.target = 'true';
    if (node.info?.formalStatus) card.dataset.status = node.info.formalStatus;
    card.dataset.hasBranches = String(!!node.children.length);
    if (matches.some(match => match.id === node.id)) card.classList.add('is-match');
    if (node.id === activeId) card.classList.add('is-active');
    Object.assign(card.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px`, height: `${node.height}px` });
    const main = element('button', 'node-main'); main.type = 'button'; main.dataset.nodeId = node.id;
    main.setAttribute('aria-label', `${node.code ? `${node.code} ` : ''}${node.title}，${node.type === 'group' ? '聚焦课程组' : '查看说明'}`);
    if (node.code || node.type === 'combination') main.appendChild(element('span', 'node-code', node.type === 'combination' ? node.label : node.code));
    main.appendChild(element('span', 'node-title', node.title));
    let meta = node.label;
    if (node.type === 'course') meta = `${node.course.points} 分 · ${node.children.length ? `${node.children.length} 组准备关系` : SHORT_STATUS[node.info.formalStatus] || '要求待核实'}`;
    if (node.type === 'combination') meta = KINDS[node.kind];
    if (node.type === 'external') meta = '项目外准备课程 · 不计选课分';
    if (node.type === 'knowledge') meta = '知识基础 · 不计选课分';
    if (meta) main.appendChild(element('span', 'node-meta', meta));
    main.addEventListener('click', () => {
      if (node.type === 'group') { $('group-focus').value = node.group; fitBounds(node.bounds, 1); return; }
      if (node.type === 'root') { fitAll(); return; }
      showDetail(node);
    });
    main.addEventListener('focus', () => {
      const r = main.getBoundingClientRect(), v = viewport.getBoundingClientRect();
      if (r.right < v.left || r.left > v.right || r.bottom < v.top || r.top > v.bottom) focusNode(node, false);
    });
    card.appendChild(main);
    if (node.children.length && node.type !== 'root' && node.type !== 'group') {
      const toggle = element('button', 'node-toggle', expanded.has(node.id) ? '−' : '+'); toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(expanded.has(node.id)));
      toggle.setAttribute('aria-label', `${expanded.has(node.id) ? '收起' : '展开'} ${node.code || node.title} 的准备分支`);
      toggle.addEventListener('click', () => {
        const wasOpen = expanded.has(node.id);
        if (wasOpen) expanded.delete(node.id); else expanded.add(node.id);
        activeId = node.id; render();
        const bounds = { x: node.x - 15, y: node.y + node.height / 2 - node.subHeight / 2 - 15, width: node.subWidth + 30, height: node.subHeight + 30 };
        fitBounds(bounds, 1.05); showDetail(node);
        const newToggle = nodesHost.querySelector(`[data-node-id="${CSS.escape(node.id)}"] .node-toggle`);
        newToggle?.focus({ preventScroll: true });
      });
      card.appendChild(toggle);
    }
    return card;
  }
  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    viewport.style.backgroundPosition = `${view.x % 22}px ${view.y % 22}px`;
    $('zoom-value').textContent = `${Math.round(view.scale * 100)}%`;
    $('view-caption').textContent = isFitView ? '全图鸟瞰 · 放大阅读节点' : '自由浏览';
    world.dataset.scale = view.scale;
    $('zoom-in').disabled = view.scale >= 2;
    $('zoom-out').disabled = view.scale <= 0.012;
  }
  function fitBounds(bounds, maxScale = 1) {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    const padding = width < 600 ? 28 : 45;
    view.scale = Math.max(0.008, Math.min(maxScale, (width - padding * 2) / bounds.width, (height - 112) / bounds.height));
    view.x = (width - bounds.width * view.scale) / 2 - bounds.x * view.scale;
    view.y = 45 + (height - 112 - bounds.height * view.scale) / 2 - bounds.y * view.scale;
    isFitView = false; applyView();
  }
  function fitAll() {
    fitBounds({ x: 0, y: 0, ...dimensions });
    isFitView = true; $('group-focus').value = 'all'; applyView();
  }
  function focusNode(node, zoom = true) {
    if (zoom) view.scale = Math.max(0.9, Math.min(view.scale, 1.3));
    view.x = viewport.clientWidth / 2 - (node.x + node.width / 2) * view.scale;
    view.y = viewport.clientHeight / 2 - (node.y + node.height / 2) * view.scale;
    isFitView = false; applyView();
  }
  function zoomTo(scale, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    scale = Math.max(0.012, Math.min(2, scale));
    const ratio = scale / view.scale;
    view.x = x - (x - view.x) * ratio; view.y = y - (y - view.y) * ratio; view.scale = scale;
    isFitView = false; applyView();
  }
  function officialUrl(code) {
    const fallback = `https://study.auckland.ac.nz/ords/r/uoa/catalogue/course?p6_code=${encodeURIComponent(code)}`;
    try { const url = new URL(verified.get(code)?.sourceUrl || fallback); return url.protocol === 'https:' && url.hostname.endsWith('.auckland.ac.nz') ? url.href : fallback; } catch { return fallback; }
  }
  function showDetail(node) {
    activeId = node.id;
    nodesHost.querySelectorAll('.is-active').forEach(card => card.classList.remove('is-active'));
    nodesHost.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`)?.classList.add('is-active');
    $('node-detail').hidden = false;
    $('detail-title').textContent = node.code ? `${node.code} · ${node.title === node.code ? '准备课程' : node.title}` : node.title;
    $('detail-kicker').textContent = node.type === 'course' ? `${node.target ? '目标课程' : '项目内准备课程'} · ${node.course.points} 分` : node.type === 'combination' ? `${KINDS[node.kind]} · ${node.label}` : node.type === 'external' ? '项目外准备课程 · 不计入选课学分' : '知识基础 · 不计入选课学分';
    const body = $('detail-body'); body.replaceChildren();
    if (node.type === 'course') {
      body.appendChild(element('p', `formal-note${node.info.formalStatus === 'conflict' ? ' warning-note' : ''}`, node.info.formalNote || '尚未核验正式先修要求。'));
      if (!node.children.length) body.appendChild(element('p', '', node.cycle ? '此处已回到上层课程，停止递归；不重复推演先修关系。' : '未找到可以继续建立的已核验准备关系。此课程仍保留在全课程总图中。'));
      else body.appendChild(element('p', '', `已核验 ${node.children.length} 组准备关系。点击节点旁的 ＋ 展开；能力基础要求并不等于必须修过指定课程。`));
      (node.info.notes || []).forEach(note => body.appendChild(element('p', '', note)));
    } else if (node.type === 'combination') {
      body.appendChild(element('p', 'formal-note', `${KINDS[node.kind]}。${node.label}。${node.info.note || ''}`));
    } else {
      if (node.info.note) body.appendChild(element('p', '', node.info.note));
      body.appendChild(element('p', '', node.type === 'external' ? '此课程在本项目的 94 门目标课程之外，仅作为官网列出的准备参考。未继续推测其先修关系，也不会计入项目选课学分。' : '这是课程或知识准备说明，不会被当作可勾选课程，也不会计入项目学分。'));
    }
    if (node.itemNote) body.appendChild(element('p', '', node.itemNote));
    const isCourse = node.type === 'course';
    $('detail-course-link').hidden = !isCourse;
    $('detail-tree-link').hidden = !isCourse;
    const code = isCourse ? node.code : node.ownerCode;
    $('detail-course-link').href = `course-detail.html?code=${encodeURIComponent(code || '')}`;
    $('detail-tree-link').href = `prerequisite-tree.html?code=${encodeURIComponent(code || '')}`;
    if (params.get('embed') === '1') { $('detail-course-link').target = '_top'; $('detail-tree-link').target = '_top'; }
    $('detail-source-link').href = officialUrl(node.type === 'external' ? node.code : code);
    $('detail-source-link').textContent = node.type === 'external' ? '准备课程官方页面 ↗' : '官方课程说明 ↗';
  }
  function search() {
    $('group-focus').value = 'all';
    const query = normalise($('overview-search').value);
    matches = query ? [...allNodes.values()].filter(node => !['root', 'group'].includes(node.type) && normalise([node.code, node.title, node.label, node.info?.note].join(' ')).includes(query)) : [];
    matchIndex = matches.length ? 0 : -1;
    matches.forEach(node => { if (node.children.length) expanded.add(node.id); let parent = node.parent; while (parent) { expanded.add(parent.id); parent = parent.parent; } });
    if (!matches.length) { activeId = null; $('node-detail').hidden = true; }
    render();
    if (matches.length) goToMatch(0);
    else {
      $('search-status').textContent = query ? '没有匹配的课程或知识。所有目标课程仍保留在图中，请换个关键词。' : '全部课程始终保留在图中。点击课程旁的 ＋，展开准备关系。';
      if (!query) fitAll();
      $('search-prev').disabled = true; $('search-next').disabled = true;
    }
  }
  function goToMatch(index) {
    if (!matches.length) return;
    matchIndex = (index + matches.length) % matches.length;
    const node = matches[matchIndex];
    let parent = node.parent; while (parent) { expanded.add(parent.id); parent = parent.parent; }
    if (!visibleNodes.includes(node)) render();
    focusNode(node); showDetail(node);
    $('search-status').textContent = `定位 ${matchIndex + 1} / ${matches.length}：${node.code || node.title}。所有 ${metadata.length} 门目标课程仍在总图中。`;
    $('search-prev').disabled = matches.length < 2; $('search-next').disabled = matches.length < 2;
  }
  $('search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); search(); });
  $('overview-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 230); });
  $('search-prev').addEventListener('click', () => goToMatch(matchIndex - 1));
  $('search-next').addEventListener('click', () => goToMatch(matchIndex + 1));
  $('expand-all').addEventListener('click', () => { allNodes.forEach(node => { if (node.children.length) expanded.add(node.id); }); render(); fitAll(); });
  $('collapse-all').addEventListener('click', () => { expanded.clear(); allNodes.forEach(node => { if (node.type === 'combination') expanded.add(node.id); }); matches = []; matchIndex = -1; activeId = null; $('overview-search').value = ''; $('search-prev').disabled = true; $('search-next').disabled = true; $('node-detail').hidden = true; $('search-status').textContent = `已收起准备分支；全部 ${metadata.length} 门课程与三个课程组仍完整显示。`; render(); fitAll(); });
  $('group-focus').addEventListener('change', event => { const branch = root.children.find(node => node.group === event.target.value); if (branch) fitBounds(branch.bounds, 1); else fitAll(); });
  $('zoom-in').addEventListener('click', () => zoomTo(view.scale * 1.3));
  $('zoom-out').addEventListener('click', () => zoomTo(view.scale / 1.3));
  $('zoom-reset').addEventListener('click', () => zoomTo(1));
  $('fit-all').addEventListener('click', fitAll);
  $('detail-close').addEventListener('click', () => { $('node-detail').hidden = true; const button = nodesHost.querySelector(`[data-node-id="${CSS.escape(activeId || '')}"] .node-main`); button?.focus({ preventScroll: true }); });
  viewport.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault(); const rect = viewport.getBoundingClientRect();
    zoomTo(view.scale * Math.exp(-event.deltaY * 0.003), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
  });
  viewport.addEventListener('pointermove', event => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
    if (!dragging.moved && Math.hypot(dx, dy) < 5) return;
    if (!dragging.moved) { viewport.setPointerCapture(event.pointerId); dragging.moved = true; viewport.classList.add('is-dragging'); }
    view.x = dragging.viewX + dx; view.y = dragging.viewY + dy; isFitView = false; applyView();
  });
  function endDrag(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    suppressClick = dragging.moved;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    dragging = null; viewport.classList.remove('is-dragging');
    setTimeout(() => { suppressClick = false; }, 0);
  }
  viewport.addEventListener('pointerup', endDrag); viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', () => { dragging = null; viewport.classList.remove('is-dragging'); });
  viewport.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } }, true);
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport) return;
    const shifts = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
    if (shifts[event.key]) { event.preventDefault(); view.x += shifts[event.key][0]; view.y += shifts[event.key][1]; isFitView = false; applyView(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(view.scale * 1.3); }
    else if (event.key === '-') { event.preventDefault(); zoomTo(view.scale / 1.3); }
    else if (event.key === 'Home') { event.preventDefault(); fitAll(); }
    else if (event.key === 'Escape') $('node-detail').hidden = true;
  });
  let lastWidth = 0, lastHeight = 0;
  new ResizeObserver(() => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height || (width === lastWidth && height === lastHeight)) return;
    if (isFitView || !lastWidth) fitAll();
    else { view.x += (width - lastWidth) / 2; view.y += (height - lastHeight) / 2; applyView(); }
    lastWidth = width; lastHeight = height;
  }).observe(viewport);
  render(); fitAll();
  if (params.get('code')) { $('overview-search').value = params.get('code'); search(); }
})();
