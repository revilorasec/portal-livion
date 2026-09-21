/* Optional category suggestions. Only an explicit acceptance changes the form. */
(() => {
  const button = document.getElementById('suggestCategory');
  const apply = document.getElementById('applyCategorySuggestion');
  const status = document.getElementById('categorySuggestionStatus');
  const form = document.getElementById('expenseForm');
  if (!button || !apply || !status || !form) return;
  let revision = 0, pending = null, busy = false;
  const snapshot = () => JSON.stringify([$('eCompany').value, $('eDesc').value, $('eCategory').value, editingExpenseId]);
  const invalidate = () => { revision++; pending = null; apply.hidden = true; status.textContent = ''; };
  form.addEventListener('input', invalidate);
  form.addEventListener('change', invalidate);
  form.addEventListener('reset', invalidate);
  button.addEventListener('click', async () => {
    if (busy) return;
    invalidate();
    if (!B?.permissions?.create) { status.textContent = 'Seu acesso não permite criar despesas.'; return; }
    const description = $('eDesc').value.trim(), company_key = $('eCompany').value;
    if (!company_key) { status.textContent = 'Selecione a empresa.'; return; }
    if (description.length < 4) { status.textContent = 'Descreva o motivo e o que foi comprado para sugerir uma categoria.'; return; }
    if (description.length > 2000) { status.textContent = 'Use até 2.000 caracteres no motivo para solicitar a sugestão.'; return; }
    const current = revision, original = snapshot();
    busy = true; button.disabled = true; status.textContent = 'Consultando sugestão…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
    try {
      const result = await call(EXP_API.replace('/expenses-api', '/expense-category-ai'), '', { method: 'POST', body: JSON.stringify({ company_key, description }), signal: controller.signal });
      if (current !== revision || original !== snapshot()) return;
      const suggestion = result.suggestion;
      if (!suggestion || ![...$('eCategory').options].some(o => o.value === String(suggestion.category_id))) { status.textContent = 'Não foi possível identificar uma categoria. Escolha manualmente ou detalhe o motivo.'; return; }
      pending = { id: String(suggestion.category_id), original };
      status.textContent = 'Sugestão: ' + suggestion.name + '. Confira antes de usar.';
      apply.hidden = false;
    } catch (error) {
      if (current !== revision || original !== snapshot()) return;
      const messages = { TYPESAFE_NOT_CONFIGURED: 'A sugestão por IA ainda não foi ativada. Por enquanto, selecione a categoria manualmente.', FORBIDDEN: 'Seu acesso não permite solicitar esta sugestão.', UNAUTHORIZED: 'Sua sessão expirou. Entre novamente no Portal.', AI_BUSY: 'O serviço está ocupado. Tente novamente em alguns instantes.' };
      status.textContent = messages[error.message] || 'A sugestão está indisponível no momento. Você pode selecionar a categoria manualmente.';
    } finally { clearTimeout(timer); busy = false; button.disabled = false; }
  });
  apply.addEventListener('click', () => {
    if (!pending || pending.original !== snapshot()) { invalidate(); return; }
    const id = pending.id;
    if (![...$('eCategory').options].some(o => o.value === id)) { invalidate(); return; }
    $('eCategory').value = id;
    manualTouched.add('eCategory');
    $('eCategory').dispatchEvent(new Event('change', { bubbles: true }));
    invalidate(); status.textContent = 'Categoria aplicada ao formulário. Confira os dados antes de salvar.';
  });
})();
