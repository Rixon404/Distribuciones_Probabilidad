# Laboratorio de distribuciones

Explorador en español para las distribuciones uniforme, binomial, hipergeométrica y Poisson. Incluye una interfaz web adaptable a móvil y escritorio, una gráfica de la función de probabilidad, resumen estadístico y una consulta para calcular probabilidades de valores o rangos.

## Ejecutar la versión web localmente

Requiere Python 3.10 o superior.

```bash
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
source .venv/bin/activate
pip install -r requirements.txt
python web_app.py
```

Abre <http://localhost:5000>. La versión original de escritorio sigue disponible con `python main.py`.

## Consultar una probabilidad

En el buscador debajo de la gráfica puedes ingresar expresiones como:

- `x=3` para P(X = 3)
- `x<2`, `x>=1` o `x<=4`
- `0<=x<3` para un rango con límites abiertos o cerrados

La app suma las probabilidades de los valores posibles de la distribución que cumplen la condición, muestra los valores incluidos y los resalta en la gráfica.

## Publicar en internet

Para GitHub Pages, configura el repositorio en **Settings → Pages → Deploy from a branch**, selecciona la rama principal y la carpeta `/docs`. Esa carpeta contiene una versión estática completa: hace los cálculos en el navegador y GitHub Pages puede publicarla sin ejecutar Python. Chart.js y las fuentes se cargan desde CDN.

La versión Flask también está preparada para una plataforma de hosting Python que lea un `Procfile` (por ejemplo, Render o Railway): configura `python` como raíz del servicio, instala `requirements.txt` y ejecuta `gunicorn web_app:app`. GitHub Pages no ejecuta Flask; en Pages se publica la versión estática de `docs`.

El gráfico usa Chart.js desde jsDelivr y las fuentes desde Google Fonts; se requiere conexión a internet en el navegador para cargarlos.
