(() => {
  const $ = id => document.getElementById(id);
  let csrf, page = 1, total = 0, rows = [], currentId;
  const statusNames = {new:'New / 待处理', contacted:'Contacted / 已联系', closed:'Closed / 已结束'};
  const notificationNames = {pending:'Pending / 等待发送',retrying:'Retry scheduled / 等待重试',queued:'Accepted by mail server / 邮件服务器已接收'};
  const date = value => new Date(value).toLocaleString('en-AU', {timeZone:'Australia/Brisbane'});
  function access(authenticated) { $('loginPanel').hidden = authenticated; $('dashboard').hidden = !authenticated; $('logout').hidden = !authenticated; if(!authenticated) { rows=[]; $('quoteRows').replaceChildren(); $('quoteDialog').close(); } }
  async function api(action, method='GET', body) {
    const response = await fetch('/api/quotes.php?action=' + action, {method, credentials:'same-origin', cache:'no-store', ...(body ? {headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)} : {})});
    const result = await response.json();
    if(!response.ok) { if(response.status===401) access(false); throw new Error(result.error || 'Request failed'); }
    if(result.csrf) csrf=result.csrf;
    return result;
  }
  const message = error => { $('adminFeedback').textContent = error.message; };
  function node(tag, text, className) { const el=document.createElement(tag); el.textContent=text; if(className) el.className=className; return el; }
  function openDetail(quote) {
    currentId=quote.id; $('quoteDetails').replaceChildren();
    $('quoteDetails').append(node('dt','Owner notification / 站主通知'),node('dd',quote.notification_status ? notificationNames[quote.notification_status] : 'No notification scheduled / 未安排邮件通知'));
    if(quote.notification_status) $('quoteDetails').append(node('dt','Send attempts / 发送次数'),node('dd',String(quote.notification_attempts)));
    for(const [key,value] of [['Reference',quote.id],['Name',quote.name],['Email',quote.email],['Phone',quote.phone || '—'],['Business',quote.business || '—'],['Package',quote.package],['Source',quote.source],['Received',date(quote.created_at)],['Updated',date(quote.updated_at)]]) $('quoteDetails').append(node('dt',key),node('dd',value));
    $('quoteMessage').textContent=quote.message; $('updateForm').elements.status.value=quote.status; $('updateForm').elements.notes.value=quote.notes; $('detailFeedback').textContent=''; $('quoteDialog').showModal();
  }
  async function load() {
    const filters=new FormData($('filterForm'));
    const result=await api('list&'+new URLSearchParams({status:filters.get('status'),q:filters.get('q'),page}));
    rows=result.quotes; total=result.total;
    for(const key of ['new','contacted','closed']) $(key+'Count').textContent=result.counts[key];
    $('quoteRows').replaceChildren();
    rows.forEach(quote=>{
      const tr=node('tr',''), customer=node('td',quote.name); customer.append(node('small',quote.email));
      const status=node('td',''); status.append(node('span',statusNames[quote.status],'status-badge'));
      if(quote.notification_status) status.append(node('small',notificationNames[quote.notification_status]));
      const action=node('td',''), button=node('button','View / 查看','row-button'); button.type='button'; button.addEventListener('click',()=>openDetail(quote)); action.append(button);
      tr.append(customer,node('td',/^\d+$/.test(quote.package)?'$'+quote.package:quote.package),node('td',quote.source==='business-demo'?'Demo / 演示':'Website / 主站'),status,node('td',date(quote.created_at)),action); $('quoteRows').append(tr);
    });
    $('emptyState').hidden=rows.length>0; $('pageLabel').textContent='Page '+page+' / '+Math.max(1,Math.ceil(total/25))+' · '+total+' enquiries'; $('previous').disabled=page<=1; $('next').disabled=page*25>=total;
    $('adminFeedback').textContent='';
  }
  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault(); const button=$('loginForm').querySelector('button'); button.disabled=true;
    try { if(!csrf) await api('session'); const result=await api('login','POST',Object.fromEntries(new FormData($('loginForm')))); access(result.authenticated); $('loginForm').reset(); page=1; await load(); } catch(error){message(error);} finally{button.disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{try{await api('logout','POST',{});access(false);}catch(error){message(error);}});
  $('filterForm').addEventListener('submit',event=>{event.preventDefault();page=1;load().catch(message);});
  $('refresh').addEventListener('click',()=>load().catch(message));
  $('previous').addEventListener('click',()=>{if(page>1){page--;load().catch(message);}});
  $('next').addEventListener('click',()=>{if(page*25<total){page++;load().catch(message);}});
  $('closeDialog').addEventListener('click',()=>$('quoteDialog').close());
  $('updateForm').addEventListener('submit',async event=>{
    event.preventDefault(); const button=$('updateForm').querySelector('button'); button.disabled=true;
    try { await api('update','PATCH',{id:currentId,...Object.fromEntries(new FormData($('updateForm')))}); await load(); $('detailFeedback').textContent='Saved / 已保存'; } catch(error){$('detailFeedback').textContent=error.message;} finally{button.disabled=false;}
  });
  api('session').then(async result=>{access(result.authenticated);if(result.authenticated)await load();}).catch(message);
})();
