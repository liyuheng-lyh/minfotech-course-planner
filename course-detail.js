(() => {
  'use strict';
  const GROUPS = { group1: '第一组选修课', group2: '第二组选修课', internship: '实习' };
  const STORAGE_KEY = 'uoa-minfotech-180-selection-v1';
  const PLAN_URL = 'https://study.auckland.ac.nz/ords/r/uoa/catalogue/plan?p7_code=INFT-T3MInfoTech';
  const data = window.COURSE_DETAILS_DATA || {};
  const detailed = Array.isArray(data.courses) ? data.courses : [];
  const fallback = window.COURSE_CATALOGUE_DATA?.courses || [];
  const byCode = new Map(fallback.map(item => [item.code, item]));
  detailed.forEach(item => byCode.set(item.code, { ...byCode.get(item.code), ...item }));
  const courses = [...byCode.values()];
  const code = (new URLSearchParams(location.search).get('code') || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const course = byCode.get(code);
  const el = id => document.getElementById(id);
  const clean = value => value == null ? '' : String(value).trim();
  function copy(id, value, missing = '学校目录暂未公开此项资料。') {
    const node = el(id);
    node.textContent = clean(value) || missing;
    node.classList.toggle('missing', !clean(value));
  }
  function safeLink(value, fallbackUrl) {
    try {
      const url = new URL(value || fallbackUrl);
      return url.protocol === 'https:' && url.hostname.endsWith('.auckland.ac.nz') ? url.href : fallbackUrl;
    } catch { return fallbackUrl; }
  }
  function makeTable(id, rows, columns, caption, missing) {
    const container = el(id);
    const usableRows = Array.isArray(rows) ? rows.filter(row => row && columns.some(column => clean(row[column.key]))) : [];
    if (!usableRows.length) {
      const p = document.createElement('p');
      p.className = 'missing'; p.textContent = missing; container.appendChild(p); return;
    }
    const wrap = document.createElement('div'); wrap.className = 'table-wrap';
    const table = document.createElement('table'); table.setAttribute('aria-label', caption);
    const head = document.createElement('thead'); const heading = document.createElement('tr');
    columns.forEach(column => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = column.label; heading.appendChild(th); });
    head.appendChild(heading); table.appendChild(head);
    const body = document.createElement('tbody');
    usableRows.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(column => { const td = document.createElement('td'); td.textContent = clean(row[column.key]) || '未公布'; tr.appendChild(td); });
      body.appendChild(tr);
    });
    table.appendChild(body); wrap.appendChild(table); container.appendChild(wrap);
  }
  if (!course) { el('empty').hidden = false; return; }
  el('course-page').hidden = false;
  const sections = course.sections || {};
  const points = Number(course.points) || (course.group === 'internship' ? 60 : 15);
  const groupName = GROUPS[course.group] || '选修课程';
  document.title = `${course.code} ${course.title} · 课程详情`;
  copy('course-code', course.code); copy('course-title', course.title);
  copy('hero-points', `${points} 分`); copy('meta-group', groupName);
  copy('selection-points', `${groupName} · ${points} 分`);
  const fields = { prescription: 'prescription', overview: 'overview', topics: 'topics', prerequisites: 'prerequisites', workload: 'workload', 'teaching-copy': 'teaching', resources: 'resources', outcomes: 'outcomes', programme: 'programme' };
  Object.entries(fields).forEach(([id, field]) => copy(id, sections[field]));
  if (clean(sections.assessmentNotes)) { el('assessment-notes').hidden = false; copy('assessment-notes', sections.assessmentNotes); }
  if (clean(course.availabilityNote)) { el('availability-note').hidden = false; copy('availability-note', course.availabilityNote); }
  if (!course.sections) { el('data-message').hidden = false; copy('data-message', '这门课程的详细中文资料暂未载入，可通过官方链接查看学校课程原页。'); }
  makeTable('scheduled-offerings', course.offerings?.scheduled, [{ key: 'year', label: '年份' }, { key: 'term', label: '学期' }, { key: 'campus', label: '校区' }, { key: 'startDate', label: '开始日期' }], '官方已公布的具体排课', '学校目录暂未列出具体年份的排课信息。');
  makeTable('typical-offerings', course.offerings?.typical, [{ key: 'campus', label: '校区' }, { key: 'term', label: '通常开设学期' }], '通常开设的学期与校区', '学校目录暂未公布通常开设的学期与校区。');
  makeTable('assessment-table', course.assessments, [{ key: 'type', label: '考核项目' }, { key: 'weight', label: '占比' }, { key: 'classification', label: '考核类别' }], '考核构成及占比', '学校目录暂未公开具体考核项目及占比。');
  const officialFallback = `https://study.auckland.ac.nz/ords/r/uoa/catalogue/course?p6_code=${encodeURIComponent(course.code)}`;
  el('official-link').href = safeLink(course.url || course.officialUrl, officialFallback);
  el('plan-link').href = safeLink(data.sourcePlan, PLAN_URL);
  if (clean(course.newerVersionUrl)) { el('newer-version-link').href = safeLink(course.newerVersionUrl, officialFallback); el('newer-version-link').hidden = false; }
  const updated = clean(data.updatedAt);
  copy('updated-at', /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : updated, '未记录');
  if (clean(course.versionLabel)) { el('version-fact').hidden = false; copy('version-label', course.versionLabel); }
  const directory = el('course-directory');
  Object.entries(GROUPS).forEach(([key, label]) => {
    const groupCourses = courses.filter(item => item.group === key);
    if (!groupCourses.length) return;
    const optgroup = document.createElement('optgroup'); optgroup.label = `${label}（${groupCourses.length} 门）`;
    groupCourses.forEach(item => { const option = document.createElement('option'); option.value = item.code; option.textContent = `${item.code} · ${item.title}`; option.selected = item.code === code; optgroup.appendChild(option); });
    directory.appendChild(optgroup);
  });
  const detailUrl = item => `course-detail.html?code=${encodeURIComponent(item.code)}`;
  directory.addEventListener('change', () => { const target = byCode.get(directory.value); if (target) location.href = detailUrl(target); });
  const siblings = courses.filter(item => item.group === course.group);
  const currentIndex = siblings.findIndex(item => item.code === code);
  copy('directory-position', `${groupName} · 第 ${currentIndex + 1} / ${siblings.length} 门`);
  [['previous-course', siblings[currentIndex - 1]], ['next-course', siblings[currentIndex + 1]]].forEach(([id, item]) => {
    const anchor = el(id);
    if (item) { anchor.href = detailUrl(item); anchor.title = `${item.code} ${item.title}`; }
    else { anchor.setAttribute('aria-disabled', 'true'); anchor.removeAttribute('href'); }
  });
  const selectionId = course.code.replace(' ', '-');
  function readSelection() {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return new Set(Array.isArray(saved) ? saved.filter(item => typeof item === 'string') : []); }
    catch { return new Set(); }
  }
  function refreshSelection() {
    const selected = readSelection().has(selectionId);
    el('select-course').checked = selected;
    copy('selection-label', selected ? '已加入我的选课' : '加入我的选课');
    copy('selection-status', selected ? '已保存，可随时取消。' : '勾选后计入选课规划器。');
  }
  el('select-course').addEventListener('change', () => {
    const selected = readSelection();
    el('select-course').checked ? selected.add(selectionId) : selected.delete(selectionId);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected])); refreshSelection(); }
    catch { copy('selection-status', '浏览器未能保存，请允许本地存储后重试。'); }
  });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) refreshSelection(); });
  window.addEventListener('pageshow', refreshSelection);
  refreshSelection();
  const anchors = [...document.querySelectorAll('.section-nav a')];
  function markActive(id) { anchors.forEach(anchor => { const active = anchor.hash === `#${id}`; anchor.classList.toggle('active', active); if (active) anchor.setAttribute('aria-current', 'location'); else anchor.removeAttribute('aria-current'); }); }
  markActive('about');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top); if (visible[0]) markActive(visible[0].target.id); }, { rootMargin: '-75px 0px -65% 0px' });
    document.querySelectorAll('.chapter').forEach(chapter => observer.observe(chapter));
  }
})();
