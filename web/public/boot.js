// Paint the last-used theme before the app loads, so there is no flash.
try {
  var c = JSON.parse(localStorage.getItem('calmlist:theme-cache') || 'null')
  var r = document.documentElement
  if (c) {
    r.dataset.theme = c.scheme
    r.dataset.themeId = c.id
    for (var k in c.vars) r.style.setProperty(k, c.vars[k])
  } else if (matchMedia('(prefers-color-scheme: light)').matches) r.dataset.theme = 'light'
} catch (e) {}
