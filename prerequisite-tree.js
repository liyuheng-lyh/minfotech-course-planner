(() => {
  'use strict';
  const GROUPS = { group1: '第一组选修课', group2: '第二组选修课', internship: '实习' };
  const KIND_LABELS = { required: '课程要求', recommended: '建议先学（非强制）', uncertain: '需向学校确认' };
  const STATUS_LABELS = { none: '官方目录明确：没有强制先修课程或修读限制。', unspecified: '官方目录暂未明确公布强制先修要求；不能据此认定为无要求。', required: '官方列有强制先修要求，请核对下方组合条件。', conflict: '官方条目存在需要核实的信息，请向学校确认先修资格。' };
  const STORAGE_KEY = 'uoa-minfotech-180-selection-v1';
  const SOURCE_PLAN = 'https://study.auckland.ac.nz/ords/r/uoa/catalogue/plan?p7_code=INFT-T3MInfoTech';
  const metadata = window.COURSE_CATALOGUE_DATA?.courses || [];
  const data = window.PREREQUISITE_DATA || {};
  const catalogue = new Map(metadata.map(item => [item.code, item]));
  const prerequisites = new Map((data.courses || []).map(item => [item.code, item]));
  const el = id => document.getElementById(id);
  const plain = value => value == null ? '' : String(value).trim();
  const normalise = value => plain(value).toLowerCase().replace(/[\s-]+/g, '');
  function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; }
  function officialUrl(code) { return `https://study.auckland.ac.nz/ords/r/uoa/catalogue/course?p6_code=${encodeURIComponent(code)}`; }
  function safeUrl(value, fallback) { try { const url = new URL(value || fallback); return url.protocol === 'https:' && url.hostname.endsWith('.auckland.ac.nz') ? url.href : fallback; } catch { return fallback; } }
  function sourceLink(code, label = '官方课程页面 ↗') { const link = node('a', '', label); link.href = safeUrl(prerequisites.get(code)?.sourceUrl, officialUrl(code)); link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
  function readSelection() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return new Set(Array.isArray(saved) ? saved.filter(item => typeof item === 'string') : []); } catch { return new Set(); } }
  let selected = readSelection();
  let currentCode = (new URLSearchParams(location.search).get('code') || 'COMPSCI 702').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!catalogue.has(currentCode)) {
    const requested = currentCode.slice(0, 80);
    currentCode = catalogue.has('COMPSCI 702') ? 'COMPSCI 702' : metadata[0]?.code;
    el('request-message').hidden = false;
    el('request-message').textContent = currentCode ? `未找到指定课程“${requested}”，已显示 ${currentCode}，可重新选择。` : '课程目录资料未能加载，请刷新页面后重试。';
  }
  const isSelected = code => selected.has(code.replace(' ', '-'));
  function allItemText(items) { return (items || []).map(item => [item.code, item.text, item.label, item.note, allItemText(item.items)].filter(Boolean).join(' ')).join(' '); }
  const searchIndex = new Map(metadata.map(course => { const info = prerequisites.get(course.code) || {}; return [course.code, normalise([course.code, course.title, info.formalNote, ...(info.groups || []).map(group => `${group.label || ''} ${allItemText(group.items)}`), ...(info.notes || [])].join(' '))]; }));
  const updated = plain(data.updatedAt);
  el('updated-at').textContent = /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : updated || '未记录';
  el('plan-source').href = safeUrl(data.sourcePlan, SOURCE_PLAN);
  function logicLabel(group, kind) {
    if (group.logic === 'credits') return `从下列课程累计至少 ${plain(group.minPoints) || '指定'} 分${kind === 'recommended' ? '（建议）' : ''}`;
    if (group.logic === 'any') return '任选其一';
    if (kind === 'recommended') return (group.items || []).length === 1 ? '建议准备' : '建议同时准备';
    if (kind === 'uncertain') return '组合待确认';
    return '同时具备';
  }
  function kindBadge(kind) { return node('span', `node-kind ${kind}`, KIND_LABELS[kind] || KIND_LABELS.uncertain); }
  function renderGroup(group, depth, lineage, inheritedKind, budget) {
    const kind = group.kind || inheritedKind || 'uncertain';
    const item = node('li', 'requirement-group'); item.dataset.kind = kind; item.dataset.logic = group.logic || 'all';
    const details = node('details', 'node-card group-card'); details.open = depth < 3;
    const summary = node('summary'); const body = node('span', 'summary-body');
    body.append(kindBadge(kind), node('span', 'logic-badge', logicLabel(group, kind)));
    if (group.label || group.text) body.appendChild(node('span', 'group-title', group.label || group.text));
    summary.appendChild(body); details.appendChild(summary);
    const contents = node('div', 'branch-contents'); const list = node('ul', 'tree-list');
    if (group.note) contents.appendChild(node('p', 'node-note', group.note));
    (group.items || []).forEach(child => list.appendChild(child.items ? renderGroup(child, depth + 1, lineage, kind, budget) : renderItem(child, depth + 1, lineage, kind, budget)));
    contents.appendChild(list); details.appendChild(contents); item.appendChild(details); return item;
  }
  function renderItem(item, depth, lineage, kind, budget) {
    const code = plain(item.code);
    if (!code) {
      const li = node('li', 'knowledge-node'); const card = node('div', 'node-card knowledge-card');
      card.append(node('span', 'node-kind', '知识基础'), node('p', 'knowledge-title', item.text || '知识准备'));
      if (item.note) card.appendChild(node('p', 'node-note', item.note));
      li.appendChild(card); return li;
    }
    const li = node('li', 'course-node'); li.dataset.code = code;
    if (!catalogue.has(code)) {
      const card = node('div', 'node-card external-node'); card.appendChild(node('span', 'node-code', code));
      card.appendChild(node('p', 'node-note', '清单外基础课，不计入 180 分；下级先修未核验。'));
      if (item.note) card.appendChild(node('p', 'node-note', item.note));
      const links = node('div', 'node-links'); links.appendChild(sourceLink(code)); card.appendChild(links); li.appendChild(card); return li;
    }
    const meta = catalogue.get(code); const info = prerequisites.get(code);
    const details = node('details', 'node-card'); details.open = depth < 3;
    const summary = node('summary'); const body = node('span', 'summary-body');
    body.append(node('span', 'node-code', code), node('span', 'node-title', meta.title));
    const flags = node('span', 'node-flags', `${GROUPS[meta.group] || '项目课程'} · ${meta.points || 15} 分`);
    if (isSelected(code)) flags.appendChild(node('span', 'selected-badge', '规划已选 ≠ 已修'));
    body.appendChild(flags); summary.appendChild(body); details.appendChild(summary);
    const contents = node('div', 'node-body');
    if (item.note) contents.appendChild(node('p', 'node-note', item.note));
    const links = node('div', 'node-links'); const target = node('a', '', '以此课为目标查看 →'); target.href = `prerequisite-tree.html?code=${encodeURIComponent(code)}`; links.append(target, sourceLink(code)); contents.appendChild(links);
    if (lineage.has(code)) { contents.appendChild(node('p', 'cycle-note', '此课已出现在上层路径中，为避免循环，不再重复展开。')); }
    else if (depth > 12 || budget.count++ > 350) { contents.appendChild(node('p', 'cycle-note', '本分支较长，可将这门课程设为目标继续查看已核验关系。')); }
    else if (info?.groups?.length) {
      if (info.formalStatus === 'conflict') contents.appendChild(node('p', 'cycle-note', info.formalNote || STATUS_LABELS.conflict));
      const list = node('ul', 'tree-list'); const ancestors = new Set([...lineage, code]);
      info.groups.forEach(group => list.appendChild(renderGroup(group, depth + 1, ancestors, group.kind, budget))); contents.appendChild(list);
    } else {
      const status = info?.formalStatus || 'unspecified';
      contents.appendChild(node('p', 'leaf-status', !info ? '此课先修资料暂未载入，下级关系未展开。' : info.formalNote || STATUS_LABELS[status] || STATUS_LABELS.unspecified));
      if (status === 'none') contents.appendChild(node('p', 'leaf-status', '官网没有另列可继续展开的准备关系。'));
    }
    details.appendChild(contents); li.appendChild(details); return li;
  }
  function showTree(code, updateUrl = true) {
    const course = catalogue.get(code); if (!course) return;
    currentCode = code;
    el('tree-panel').hidden = false; el('empty-results').hidden = true;
    const info = prerequisites.get(code); const status = info?.formalStatus || 'unspecified';
    document.title = `${code} ${course.title} · 先修与准备关系`;
    el('target-code').textContent = code; el('root-code').textContent = code; el('target-title').textContent = course.title;
    el('target-meta').textContent = `${GROUPS[course.group] || '项目课程'} · ${course.points || (course.group === 'internship' ? 60 : 15)} 分`;
    el('target-selected').hidden = !isSelected(code);
    el('formal-status').dataset.status = info ? status : 'unloaded'; el('formal-status').textContent = !info ? '这门课程的先修资料暂未载入，当前无法确认官方要求。请刷新页面后重试，或查看官方说明。' : info.formalNote || STATUS_LABELS[status] || STATUS_LABELS.unspecified;
    el('detail-link').href = `course-detail.html?code=${encodeURIComponent(code)}`;
    el('target-source').href = safeUrl(info?.sourceUrl, officialUrl(code));
    const notes = (info?.notes || []).map(plain).filter(Boolean);
    el('target-notes').hidden = !notes.length; el('target-notes').textContent = notes.join('\n');
    const tree = el('prerequisite-tree'); tree.replaceChildren();
    const groups = info?.groups || [];
    el('tree-empty').hidden = !!groups.length;
    if (groups.length) { const list = node('ul', 'tree-list'); const budget = { count: 0 }; groups.forEach(group => list.appendChild(renderGroup(group, 0, new Set([code]), group.kind, budget))); tree.appendChild(list); }
    else el('tree-empty').textContent = !info ? '先修资料未加载，暂时无法展示关系树。' : status === 'none' ? '官网明确没有强制先修，也未另列建议课程或知识基础，因此这里不添加推测的前置关系。' : '当前官方资料没有公布可展开的先修或准备关系。未公布不代表没有要求，可通过官方链接进一步核实。';
    el('expand-all').disabled = !groups.length; el('collapse-all').disabled = !groups.length;
    if (updateUrl) { const url = new URL(location.href); url.searchParams.set('code', code); try { history.replaceState(null, '', url); } catch {} }
  }
  function renderDirectory() {
    const query = normalise(el('course-search').value); const group = el('group-filter').value;
    const filtered = metadata.filter(course => (group === 'all' || group === course.group) && (!el('selected-only').checked || isSelected(course.code)) && (!query || searchIndex.get(course.code).includes(query)));
    const directory = el('course-directory'); directory.replaceChildren();
    Object.entries(GROUPS).forEach(([key, name]) => {
      const groupCourses = filtered.filter(course => course.group === key); if (!groupCourses.length) return;
      const options = node('optgroup'); options.label = `${name}（${groupCourses.length} 门）`;
      groupCourses.forEach(course => { const option = node('option', '', `${course.code} · ${course.title}${isSelected(course.code) ? ' · 规划已选' : ''}`); option.value = course.code; options.appendChild(option); }); directory.appendChild(options);
    });
    el('search-status').textContent = `匹配 ${filtered.length} / ${metadata.length} 门课程`;
    directory.disabled = !filtered.length;
    if (!filtered.length) { el('tree-panel').hidden = true; el('empty-results').hidden = false; el('empty-message').textContent = el('selected-only').checked ? '当前筛选下没有已选课程。可取消“只看已选课程”，或回到规划器勾选课程。' : '试试课程代码、中文名称或其他基础知识关键词。'; return; }
    const next = filtered.some(course => course.code === currentCode) ? currentCode : filtered[0].code;
    directory.value = next; showTree(next);
  }
  el('course-search').addEventListener('input', renderDirectory);
  el('group-filter').addEventListener('change', renderDirectory);
  el('selected-only').addEventListener('change', renderDirectory);
  el('course-directory').addEventListener('change', () => showTree(el('course-directory').value));
  el('clear-filters').addEventListener('click', () => { el('course-search').value = ''; el('group-filter').value = 'all'; el('selected-only').checked = false; renderDirectory(); });
  el('expand-all').addEventListener('click', () => document.querySelectorAll('#prerequisite-tree details').forEach(details => { details.open = true; }));
  el('collapse-all').addEventListener('click', () => document.querySelectorAll('#prerequisite-tree details').forEach(details => { details.open = false; }));
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) { selected = readSelection(); renderDirectory(); } });
  window.addEventListener('pageshow', () => { selected = readSelection(); renderDirectory(); });
  renderDirectory();
})();
