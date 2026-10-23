import { mount } from 'svelte'
import { registerSW } from 'virtual:pwa-register'
import App from './App.svelte'
// math fonts are bundled with the app so formulas look right offline
import 'mathlive/fonts.css'
import 'mathlive/static.css'
import './styles.css'

mount(App, { target: document.getElementById('app')! })

// works offline; a new version reloads the page by itself (the formula and history are saved)
registerSW({ immediate: true })
