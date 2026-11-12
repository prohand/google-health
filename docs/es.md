# Google Health

Esta integración lleva sus datos de **Google Health** a Gladys: lo que su
pulsera o su báscula Fitbit, o su Pixel Watch, envían a su cuenta de Google.
Pasos, frecuencia cardíaca, sueño, peso y más se convierten en sensores,
widgets del panel y disparadores de escena.

El acceso es de **solo lectura**: Gladys no puede modificar nada en su cuenta.

## Antes de empezar

Necesita:

- **Gladys 5.3 o posterior**;
- una cuenta de Google que use la aplicación **Fitbit** (ahí vive el perfil de
  Google Health);
- un proyecto gratuito de **Google Cloud**. Google solo entrega los datos de
  salud a una aplicación que le pertenezca: por eso crea su propia
  «aplicación», una sola vez. Lleva unos diez minutos.

La integración habla con Google por Internet (nube): no hay modo local.

## Paso 1 — Crear su aplicación de Google

1. Abra la [consola de Google Cloud](https://console.cloud.google.com/) y cree
   un proyecto (cualquier nombre, por ejemplo `Gladys`).
2. Abra **APIs y servicios → Biblioteca**, busque **Google Health API** y pulse
   **Habilitar**.
3. Abra **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - tipo de usuario **Externo**;
   - indique el nombre de la aplicación y su dirección de correo;
   - en **Acceso a los datos**, añada los tres permisos que terminan en
     `googlehealth.activity_and_fitness.readonly`,
     `googlehealth.health_metrics_and_measurements.readonly` y
     `googlehealth.sleep.readonly`;
   - en **Público**, añada su propia dirección de Google como **usuario de
     prueba**.
4. Abra **APIs y servicios → Credenciales → Crear credenciales → ID de cliente
   de OAuth**, tipo **Aplicación web**.
5. Copie el **ID de cliente** y el **secreto de cliente**.

### El URI de redireccionamiento

Google solo le devuelve a una dirección que usted haya declarado. En el cliente
OAuth, en **URI de redireccionamiento autorizados**, añada la dirección que usa
Gladys.

La forma más sencilla de conocerla: haga el paso 2 una primera vez. Si Google
responde `redirect_uri_mismatch`, copie la dirección que aparece en los
detalles del error, o pulse **Probar la conexión** en Gladys: la dirección se
muestra bajo el botón. Añádala al cliente OAuth, espere un minuto y vuelva a
conectar.

Google solo acepta una dirección `https://` con nombre de dominio, o
`http://localhost`. Abra Gladys con una dirección así al conectar (su dirección
de Gladys Plus sirve).

## Paso 2 — Configurar la integración

1. Abra la pestaña **Configuración** de la integración.
2. Pegue el **ID de cliente OAuth** y el **secreto de cliente OAuth**, y
   **guarde**.
3. Pulse **Conectar** junto a **Cuenta de Google**, elija su cuenta y marque
   **todos** los permisos. Un permiso sin marcar deja sus sensores vacíos.
4. De vuelta en Gladys, el estado pasa a conectado. Abra la pestaña
   **Descubrimiento** y añada el dispositivo **Google Health**.

Otros ajustes:

- **Objetivo diario de pasos** y **Objetivo de sueño**: los usan el indicador
  del widget y los disparadores de escena.
- **Intervalo de actualización**: cada cuánto se lee Google (15 minutos por
  defecto, 5 minutos como mínimo). Su reloj solo se sincroniza con el teléfono
  de vez en cuando: un intervalo más corto rara vez trae datos más recientes.
- **Zona horaria**: por ejemplo `Europe/Madrid`. Decide cuándo empieza «hoy».
  Si se deja vacía, el día sigue la hora UTC.

## Lo que obtiene

### El dispositivo

Un dispositivo **Google Health** con estos sensores:

| Sensor                                            | Unidad  |
| ------------------------------------------------- | ------- |
| Pasos de hoy                                      | pasos   |
| Distancia de hoy                                  | km      |
| Calorías activas, calorías totales de hoy         | kcal    |
| Pisos de hoy                                      | pisos   |
| Minutos en zona activa de hoy                     | minutos |
| Frecuencia cardíaca, frecuencia en reposo         | lpm     |
| Sueño: duración, profundo, REM, ligero, despierto | minutos |
| Peso                                              | kg      |
| Grasa corporal, saturación de oxígeno (SpO2)      | %       |
| Variabilidad de la frecuencia cardíaca            | ms      |
| Frecuencia respiratoria                           | por min |

Un sensor queda vacío si sus dispositivos no lo miden. Los contadores «de hoy»
vuelven a cero a medianoche en su zona horaria. Los nombres de los sensores
están en inglés en Gladys; puede cambiarlos.

### Widgets del panel

- **Salud del día**: los pasos frente al objetivo, la frecuencia cardíaca, el
  último sueño, las calorías, la distancia y el peso, con un botón
  **Actualizar**.
- **Salud en 7 días**: un gráfico de barras de los últimos siete días de la
  métrica elegida (pasos, distancia, calorías, pisos, minutos en zona activa),
  con la media diaria y el mejor día.

### Escenas

Disparadores, en la categoría **Integraciones** del editor de escenas:

- **Objetivo diario de pasos alcanzado** — una vez al día. Variables: pasos,
  objetivo.
- **Se registra una noche de sueño** — filtro: objetivo alcanzado o no.
  Variables: tiempo dormido (minutos y horas), sueño profundo y REM.
- **Se registra un pesaje** — filtro: más alto, más bajo o estable. Variables:
  peso, cambio desde el pesaje anterior.
- **Se registra un entrenamiento** — variables: nombre, tipo, duración,
  calorías, distancia.

Acciones:

- **Leer Google Health ahora** — lee la cuenta sin esperar.
- **Obtener el resumen de salud del día** — devuelve las cifras y una frase
  lista (en el idioma elegido) para enviar por mensaje o decir en voz alta, por
  ejemplo: «Hoy: 8200 pasos (objetivo 10.000), 6,1 km, 2150 kcal.»

Un disparador salta cuando Google **recibe** el dato, es decir, tras la
sincronización de su reloj y en la siguiente lectura de la integración.

## Botones de la pantalla de configuración

- **Probar la conexión** — lee la cuenta ahora y dice lo que ha encontrado.
- **Desconectar la cuenta de Google** — olvida la cuenta y revoca el acceso en
  Google. El dispositivo y su historial se quedan en Gladys.

## Solución de problemas

- **`redirect_uri_mismatch`** — vea «El URI de redireccionamiento» más arriba.
- **«Acceso bloqueado» o error 403 `access_denied` en Google** — su dirección
  no está entre los **usuarios de prueba** de la pantalla de consentimiento.
- **La conexión se pierde cada 7 días** — Google hace caducar el acceso de una
  aplicación que sigue en **Prueba**. En la pantalla de consentimiento,
  **publique** la aplicación (para uso propio no se pide verificación por
  debajo de 100 usuarios; Google muestra un aviso de «aplicación no
  verificada» que puede saltarse).
- **«Esta cuenta de Google no tiene perfil de Google Health (Fitbit)»** — abra
  una vez la aplicación Fitbit con esta cuenta de Google.
- **Algunos sensores quedan vacíos** — no se marcó algún permiso: desconecte,
  vuelva a conectar y márquelo todo. O sus dispositivos no miden ese dato.
- **Los valores parecen atrasados** — abra la aplicación Fitbit en el teléfono
  para forzar la sincronización del reloj.

## Privacidad

Sus datos de salud van de Google a su Gladys, y a ningún otro sitio. La
integración solo contacta con `accounts.google.com`, `oauth2.googleapis.com` y
`health.googleapis.com`. Puede revocar el acceso en cualquier momento desde su
[cuenta de Google](https://myaccount.google.com/connections).
