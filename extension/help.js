const reason = new URLSearchParams(location.search).get('reason')
if (reason === 'unavailable') {
  document.querySelector('h1').textContent = 'Не удалось открыть панель'
  document.querySelector('#reason').textContent = 'Перезагрузите страницу сайта и вызовите MARK снова. Для локальных файлов проверьте разрешение доступа в настройках расширения.'
}

chrome.commands.getAll().then(commands => {
  const shortcut = commands.find(command => command.name === 'toggle-panel')?.shortcut
  document.querySelector('#shortcut').textContent = shortcut || 'Сочетание не назначено'
}).catch(() => {})

document.querySelector('#configure').addEventListener('click', () => {
  void chrome.tabs.create({url: 'chrome://extensions/shortcuts'})
})
