# P05 · Despieces 3D interactivos

Dos simuladores 3D nuevos, de geometría y física propias, más una página de portafolio que los presenta junto al motor V8 de la skill `teardown`.

| Pieza | Qué es | Autoría | Peso HTML offline |
|---|---|---|---|
| **Bomba centrífuga** (`dist/pump.html`) | Una etapa, voluta, impulsor de 6 álabes, corte, despiece, flujo | propia | 838 073 B (818 KB) |
| **Reloj mecánico** (`dist/clock.html`) | Cuerda manual, tren de 4 ruedas, escape de áncora suiza, volante 3 Hz | propia | 883 548 B (863 KB) |
| **Motor V8** (`site/pieces/v8.html`) | Ejemplo de la skill `teardown` (elvarofficial/teardown, MIT) | **NO es mía**: es el ejemplo de la skill, sin modificar | 825 550 B (806 KB) |

Ningún `.glb` ni modelo de terceros: toda la geometría se genera en código (`src/pump/model.js`, `src/clock/model.js`). Datos y valores de demostración.

## Qué trae cada simulador
Panel de números con unidades (tabulares) · vista de corte · despiece · etiquetas · selección de piezas · 5–6 vistas · **tour automático interrumpible** · controles por teclado (flechas giran, `+`/`−` zoom, `1`–`6` vistas, `C` corte, `E` despiece, `L` etiquetas, `P` pieza, `T` tour, espacio pausa, deslizadores con flechas) · `prefers-reduced-motion` (sin tour ni animación hasta que se pida) · modo claro/oscuro · sin WebGL: póster + aviso + números y controles siguen vivos (`?nogl` para probarlo) · pausa fuera de pantalla y con la pestaña oculta · adaptación de resolución si baja de ~40 fps · CSP `connect-src 'none'`: no hace ninguna petición.

## Física (todo en `physics.js`, sin three.js; el modelo 3D y el panel leen las mismas funciones)

### Bomba (`src/pump/physics.js`)
Impulsor Ø200 mm, ojo Ø80 mm, 6 álabes, β₂ = 25°, ancho de salida 16 mm, diseño 2 900 rpm.
- Velocidad periférica `u₂ = π·D₂·n/60` (30,37 m/s a 2 900 rpm).
- Deslizamiento de Wiesner `σ = 1 − √sin β₂ / Z^0,7` (0,815).
- Triángulo de salida: `c_m2 = Q/(η_v·π·D₂·b₂·ε)`, `c_u2 = σ·u₂ − c_m2/tan β₂`, altura de Euler `H_E = u₂·c_u2/g`.
- Altura manométrica `H = H_E − HF·Q² − HS·(Q − Q_bep·n/n₀)²` (fricción + choque fuera del diseño).
- Punto de operación: cruce (bisección) de `H(Q,n)` con la curva del sistema `H_est + (K_tubería + K_válvula·((1−o)/o)²)·Q²`.
- Potencia: `P_eje = (ρ·g·(Q/η_v)·H_E + c_DF·ρ·ω³·r₂⁵)/η_m`; rendimiento `η = ρ·g·Q·H / P_eje`; par `P/ω`.
- NPSH: `NPSHr = (λc·c₁² + λw·w₁²)/2g`, `NPSHa = h_atm − h_vap + z_aspiración − K_s·Q²`; si el margen < 0,5 m se marca cavitación.
- Velocidad específica `N_q = n·√Q/H^¾` en el punto de diseño.

Los coeficientes `HF, HS, c_DF, K_*…` son **de modelo, ajustados para una bomba plausible de ~10 kW; no son datos de fabricante**. Resultados medidos (salida de `scripts/tune-pump.mjs` y de las pruebas): a 2 900 rpm y válvula abierta 50,3 m³/h, 53,3 m, 5,21 bar, 10,12 kW en el eje, η 72,0 %, par 33,3 N·m, NPSH margen 7,3 m, N_q 17,3. A 1 500 rpm no hay caudal (la altura a válvula cerrada, 17,4 m, no vence los 30 m estáticos).

### Reloj (`src/clock/physics.js`)
Tren: barrilete 80 → piñón 10 · centro 80 → piñón 10 · tercera 75 → piñón 10 · cuarta 72 → piñón 6 · rueda de escape de 15 dientes.
- Vueltas/h: barrilete 0,125 · centro 1 (minutero) · tercera 8 · cuarta 60 (1 rpm, segundero) · escape 720 (12 rpm). Relación total `8 × 8 × 7,5 × 12 = 5 760 : 1`.
- Volante a 3 Hz → 6 alternancias/s = **21 600 alt/h**. El escape avanza medio diente (12°) por alternancia: 30 pasos por vuelta, `6 / 30 = 0,2 rev/s = 12 rpm` (comprobado contra el tren).
- Espiral: `f = (1/2π)·√(κ/I)` → `κ = I·(2πf)² = 0,284 µN·m/rad` con `I = 8·10⁻¹⁰ kg·m²`.
- Barrilete: 7 vueltas útiles a 1 vuelta/8 h = **56 h** de reserva; par 20 mN·m cayendo un 25 % al desarmarse; potencia `T·ω` = 4,36 µW; par en el escape 2,28 µN·m (4 engranajes al 90 %).
- Cinemática: todo sale del tiempo simulado τ (ángulo del volante `A·sin 2πfτ`, palanca que salta de tope a tope al cruzar el volante por su centro, rueda de escape por pasos, agujas con motion work 12:1). Escala de tiempo ×0,05 a ×3 162; a ×10 o más el volante se anima a ritmo visual y el escape gira continuo (lo avisa el panel).
- Los dientes, módulos (0,14–0,20 mm) y masas son de **diseño propio, no de un calibre comercial**; la palanca se dibuja con su ángulo físico real (±5,5°), por eso a velocidad normal su vaivén es pequeño.

## Cómo ejecutar
```powershell
cd <ruta-local>
$env:npm_config_cache='<ruta-local>'; cd teardown-base; npm ci --ignore-scripts; cd ..
node --test tests/pump.test.mjs tests/clock.test.mjs   # física (23 pruebas)
node build.mjs                                           # dist/pump.html, dist/clock.html
node tests/ui.check.mjs                                  # UI: teclado, reduced-motion, sin WebGL, consola
node scripts/site.mjs; node scripts/serve.mjs site       # portafolio en http://127.0.0.1:3150
node scripts/film.mjs pump out.mp4                       # MP4 1080×1920 a 60 fps (software GL)
```
Abrir `dist/pump.html` directamente con doble clic (`file://`) funciona sin red. Parámetros: `?nogl` (sin WebGL), `?theme=dark|light`.

## Resultados medidos
| Criterio | Resultado |
|---|---|
| Pruebas de física | 23/23 verdes (`node --test`) |
| Pruebas de UI (`tests/ui.check.mjs`, 32 comprobaciones) | 32/32 OK (teclado, tour interrumpible, reduced-motion, sin WebGL, objetivos ≥44 px, tabulares, consola limpia) |
| Peso por pieza | 838 073 B · 883 548 B · 825 550 B (< 1 MB, `wc -c`) |
| Consola | 0 errores y 0 avisos en bomba y reloj (Playwright, `file://`) |
| MP4 bomba | `ffprobe`: 1080×1920, 60/1 fps, 2 280 cuadros, 38,000 s, H.264, 17,8 MB |
| MP4 reloj | `ffprobe`: 1080×1920, 60/1 fps, 2 940 cuadros, 49,000 s, H.264, 35,9 MB |
| Portafolio (Lighthouse, chrome-devtools, móvil) | Accesibilidad 100 · Prácticas recomendadas 100 · SEO 100 · CLS 0,05 (traza) · LCP 1 501 ms (traza, sin estrangular) |
| Portafolio (Lighthouse, escritorio) | Accesibilidad 100 · SEO 100 · Prácticas 96 → 100 tras quitar el favicon 404 y el `sandbox` |
| sloplint (hallmark, nivel estático) | `index.html` y `core.css`: 0 FAIL, 0 REFLEX, 0 WARN |
| gitleaks | `no leaks found` (2 commits, 5,56 MB) |

Capturas en `docs/capturas/` (escritorio 1440 y móvil 390 de cada pieza y del portafolio) y hoja de fotogramas del MP4 de la bomba `docs/capturas/hoja-fotogramas-bomba.png`.

## Límites honestos
- **El V8 no es creación mía**; es el ejemplo de la skill `teardown`.
- La herramienta de Lighthouse de chrome-devtools no devuelve la categoría «Performance» como número; se midió LCP/CLS con una traza de rendimiento. No se afirma un «≥90» de rendimiento.
- Todo el WebGL se probó con renderizado por software (SwiftShader) porque la GPU de 4 GB estaba ocupada: **no se midió ni los 60 fps en vivo ni el rendimiento en una GPU integrada real**. El adaptador de resolución existe pero no se validó en hardware.
- Los MP4 no llevan audio. El giro de la bomba va a 1/30 de la real.
- Las propiedades de las puertas de `hallmark` de tipo render/juicio y `impeccable critique/audit` (puntajes /40 y /20) no se ejecutaron como agentes; sí el linter estático y revisión manual con capturas.

## Licencias y créditos
Código propio de P05: MIT. `teardown-base/` (elvarofficial/teardown, MIT; kit de whaleyxbt/claude-motion, MIT). three.js (MIT). Tipografías (SIL OFL, de `recursos/tipografias`): Chakra Petch, Bodoni Moda, Jost, Barlow Condensed, Atkinson Hyperlegible.

MP4 y hojas de fotogramas: `C:MisDrivesaleryProyectos Claude_ActivosExportacionesPortafolioP05` (`P05-bomba-centrifuga.mp4`, `P05-reloj-mecanico.mp4`). Los MP4 se renderizaron con una versión anterior del CSS (espaciados de 10/14 px en vez de la escala de 4 px); el contenido es idéntico.


## Rutas de la PC del autor
Algunos scripts de apoyo (compilación, base de datos, capturas) contienen rutas absolutas del equipo del autor (D:\ClaudeBrain\...). No son secretos, pero esos scripts no funcionarán en otra máquina sin cambiar las rutas. El código del proyecto y su sitio publicado no dependen de ellas.

