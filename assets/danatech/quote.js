(() => {
  const form = document.getElementById('quoteForm');
  const feedback = document.getElementById('quoteFeedback');
  const params = new URLSearchParams(location.search);
  const zh = params.get('lang') === 'zh' && form.dataset.source === 'main';
  if (zh) {
    document.documentElement.lang = 'zh-CN';
    document.title = '网站项目询价 | DanaTech';
    document.querySelectorAll('[data-zh]').forEach(el => { el.textContent = el.dataset.zh; });
    document.querySelectorAll('[data-zh-placeholder]').forEach(el => { el.placeholder = el.dataset.zhPlaceholder; });
    const language = document.getElementById('quoteLanguage');
    language.textContent = 'English'; language.lang = 'en-AU'; language.href = '/quote/';
    document.querySelectorAll('a[href="/#pricing"]').forEach(el => { el.href = '/zh/#pricing'; });
  }
  if (['199','299','888','app','ai','other'].includes(params.get('package'))) form.elements.package.value = params.get('package');
  let csrf, pending = false, requestKey = crypto.randomUUID();
  const button = form.querySelector('[type="submit"]'), label = button.textContent;
  const show = (message, error) => { feedback.hidden = false; feedback.textContent = message; feedback.dataset.error = String(error); feedback.focus(); };
  async function session() {
    const response = await fetch('/api/quotes.php?action=session', {credentials:'same-origin', cache:'no-store'});
    const result = await response.json();
    if (!response.ok || !result.csrf) throw new Error(result.error || 'The enquiry system is unavailable.');
    csrf = result.csrf;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (pending || !form.reportValidity()) return;
    pending = true; button.disabled = true; button.textContent = zh ? '正在保存…' : 'Saving enquiry…'; feedback.hidden = true;
    try {
      if (!csrf) await session();
      const fields = new FormData(form);
      const body = Object.fromEntries(fields); body.consent = fields.has('consent'); body.source = form.dataset.source; body.requestKey = requestKey;
      const response = await fetch('/api/quotes.php?action=create', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf}, body:JSON.stringify(body)});
      const result = await response.json();
      if (!response.ok || !result.saved) { if(response.status === 403) csrf = undefined; throw new Error(result.error || 'The enquiry could not be saved.'); }
      show(zh ? '询价已保存，编号：' + result.reference + '。DanaTech 将在后台查看；请保留此编号。' : 'Enquiry saved. Your reference is ' + result.reference + '. DanaTech can now review it in the owner dashboard. Keep this reference for your records.', false);
      form.reset(); if(params.has('package')) form.elements.package.value = body.package;
      requestKey = crypto.randomUUID();
    } catch (error) {
      show((zh ? '未能确认提交成功。请重试或发邮件至 admin@maketh.au。' : 'We could not confirm your submission. Please retry or email admin@maketh.au. ') + (zh ? '' : error.message), true);
    } finally { pending = false; button.disabled = false; button.textContent = label; }
  });
})();
