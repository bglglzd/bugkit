for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent
    const status = document.getElementById('copy-status')
    try {
      await navigator.clipboard.writeText(text)
      status.textContent = 'Copied. Paste into the coding agent in your target project.'
    } catch {
      status.textContent = 'Clipboard unavailable. Select and copy the command text above.'
    }
  })
}
