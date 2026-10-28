import { mount } from 'svelte'
import App from './App.svelte'
// math fonts are bundled with the app so formulas look right offline
import 'mathlive/fonts.css'
import 'mathlive/static.css'
import './styles.css'

mount(App, { target: document.getElementById('app')! })
