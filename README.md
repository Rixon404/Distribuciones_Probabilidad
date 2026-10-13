# Laboratorio de distribuciones

Explorador en español de las distribuciones uniforme, binomial, hipergeométrica, Poisson y normal. Permite consultar probabilidades para valores y rangos de X y alternar entre la gráfica de probabilidad/densidad y la acumulada.

## Publicar con GitHub Pages

1. Sube el repositorio a GitHub.
2. En **Settings → Pages**, elige **Deploy from a branch**.
3. Selecciona la rama principal y la carpeta **/docs**.

GitHub Pages publica la versión estática de `docs/`, que calcula directamente en el navegador. No requiere servidor Python. Chart.js y las fuentes se cargan desde CDN.

## Ejecutar la versión Python

La versión web Flask y la app de escritorio están en `python/`. Consulta [python/README.md](python/README.md) para instalarla, ejecutarla localmente o desplegar Flask en un hosting Python.
