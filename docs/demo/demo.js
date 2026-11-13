const result = document.querySelector('#action-result')
let clicks = 0
for (const button of document.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    clicks += 1
    result.textContent = `Обычный клик сработал: ${button.textContent.trim()} (${clicks})`
    result.dataset.clicks = String(clicks)
  })
}
const shadow = document.querySelector('#shadow-example').attachShadow({mode: 'open'})
shadow.innerHTML = '<style>button{font:inherit;padding:10px 14px;border:1px solid #cad3cf;border-radius:6px;background:white;color:#202624;cursor:pointer;margin-top:14px}</style><button type="button">Кнопка в Shadow DOM</button>'
shadow.querySelector('button').addEventListener('click', () => {
  result.textContent = 'Обычный клик внутри Shadow DOM сработал'
})
