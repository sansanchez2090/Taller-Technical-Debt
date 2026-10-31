# Informe Técnico de Auditoría Forense y Plan de Remediación Continua

> **Cliente:** FastPay Global Inc.  
> **Equipo Consultor:** Santiago Sánchez Moya
> **Fecha:** 31/10/2026  
> **Repositorio Auditado:** `https://github.com/NicolasDucuara/deuda_tecnica`  
> **Commit Hash Base:** `9ff4410`  
> **Commit Hash Remediado:** `9724a9a`

> Convención: los valores entre `[corchetes]` son datos que el equipo debe completar (nombres, URL, enlaces de PR). Las mediciones de este informe provienen de la ejecución local del equipo; las cifras financieras se derivan de `incidents-history.json`.
>
> **Historial de commits relevante:** `9ff4410` baseline legado → `677e603` pruebas de caracterización (previas al refactor) → `9724a9a` refactor hexagonal + quality gates.

---

## 1. Resumen Ejecutivo

### 1.1 Diagnóstico de Situación

El microservicio `fastpay-billing-service` concentra en un único _God Method_ (`processSubscriptionBilling`) la lectura de archivo, las reglas fiscales de cuatro países, los descuentos, la llamada a la pasarela y la persistencia. Opera con I/O síncrono sobre un archivo JSON, estado global mutable, importes monetarios en coma flotante, una clave `sk_live_` incrustada en el código e impresa en logs, y una suite de pruebas de dos casos. No existe idempotencia: el simulador evidencia que 5 solicitudes para la misma suscripción producen 5 cobros exitosos.

En el último trimestre esto se tradujo en 6 incidentes, **17.0 h de indisponibilidad**, **1,897 clientes afectados**, **USD 49,470** en pérdidas directas y **161 h de ingeniería** dedicadas a apagar incendios (USD 7,245 a USD 45/h). El 60% de rotación del equipo es coherente con una base de código sin red de pruebas y con alta complejidad (ISO/IEC 25010: Mantenibilidad / Testeabilidad). Tras la remediación, el servicio se organiza en arquitectura hexagonal, con `Money` como Value Object, idempotencia por período, I/O asíncrono, secretos en entorno, 3 _quality gates_ en GitHub Actions y deuda restante registrada formalmente (ISO/IEC/IEEE 12207, procesos de gestión de riesgos y mejora).

### 1.2 Métricas Consolidadas de Deuda Técnica

| Métrica                                             | Estado Inicial (Legacy)                                                                                                           | Estado Final (Refactorizado)                                                     | Meta / Estándar                    |
| :-------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :--------------------------------- |
| **Complejidad Ciclomática Máxima**                  | 22 (`processSubscriptionBilling`, medido con ESLint)                                                                              | ≤ 8 (0 errores `complexity` en ESLint)                                           | $\le 8$                            |
| **Complejidad Cognitiva Máxima**                    | > 25 (estimación indicada en el código legado; ESLint core no la mide)                                                            | No medida con herramienta; funciones pequeñas con ciclomática ≤ 8                | $\le 10$                           |
| **Cobertura de Pruebas (Coverage)**                 | 66.67 % líneas / 61.11 % ramas / 33.33 % funciones (con 2 pruebas sin aserciones de negocio)                                      | 100 % líneas / 100 % ramas / 100 % funciones (dominio + aplicación; 121 pruebas) | $\ge 80\%$                         |
| **Vulnerabilidades Críticas / Altas (`npm audit`)** | 0 críticas, 0 altas (9 moderadas por `minimatch`, sólo en devDependencies de ESLint 8)                                            | 0 críticas, 0 altas                                                              | 0                                  |
| **Violaciones de Linter (ESLint)**                  | 3 problemas: 1 error (`complexity` 22 > 8, L23) + 2 warnings (`TOTAL_PROCESSED_TODAY` sin usar L16; `baseAmount` sin `const` L58) | 0 (`--max-warnings=0`)                                                           | 0                                  |
| **Technical Debt Ratio (TDR)**                      | 35.5%                                                                                                                             | 9.0% (deuda diferida y registrada)                                               | $< 5.0\%$ tras pagar TDR-DEC-01/02 |

---

## 2. Inventario Formal y Clasificación de Deuda Técnica

Líneas sobre `legacy_billing_engine.js` (L23, L16 y L58 confirmadas por ESLint; el resto, aproximadas). Interés mensual = (pérdida directa + horas × USD 45) del incidente asociado ÷ 3 meses.

| ID        | Ubicación / Archivo                              | Tipo de Deuda                  | Descripción del Hallazgo / Smell                                                                                             | Cuadrante de Martin Fowler | Subcaracterística ISO/IEC 25010                               | Principal ($P$) Estimado (Horas)           | Interés Mensual ($I$) Estimado    |
| :-------- | :----------------------------------------------- | :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :------------------------- | :------------------------------------------------------------ | :----------------------------------------- | :-------------------------------- |
| **DT-01** | `legacy_billing_engine.js:L23–L152`, `L15–L16`   | Código                         | _God Method_ (CC ≈ 22, 4 responsabilidades) y estado global mutable (`LAST_BATCH_ID`, `TOTAL_PROCESSED_TODAY`).              | Deliberada – Temeraria     | Mantenibilidad (Modularidad, Analizabilidad, Modificabilidad) | 20 h                                       | Indirecto (agravante de INC-0815) |
| **DT-02** | `legacy_billing_engine.js:L11`, log en `≈L117`   | Seguridad                      | Clave `sk_live_…` hardcodeada y escrita en `console.log`. **Debe rotarse y purgarse del historial Git.**                     | Deliberada – Temeraria     | Seguridad (Confidencialidad)                                  | 3 h                                        | USD 1,392 / mes (INC-0829)        |
| **DT-03** | `legacy_billing_engine.js:L25–L135`, `server.js` | Arquitectura / Concurrencia    | Check-then-act sobre archivo sin idempotencia ni exclusión mutua: cobros duplicados. Persistencia en archivo plano (sin DB). | Inadvertida – Temeraria    | Fiabilidad (Tolerancia a fallos, Madurez)                     | 36 h (16 ahora + 20 diferidas, TDR-DEC-02) | USD 3,307 / mes (INC-0704)        |
| **DT-04** | `legacy_billing_engine.js:L106–L124`             | Resiliencia                    | Sin timeout configurable, backoff ni _circuit breaker_ ante la pasarela.                                                     | Inadvertida – Prudente     | Fiabilidad (Recuperabilidad, Tolerancia a fallos)             | 30 h (14 ahora + 16 diferidas, TDR-DEC-01) | USD 2,370 / mes (INC-0802)        |
| **DT-05** | `test/legacy.test.js`                            | Pruebas                        | 2 pruebas sin invariantes, sin impuestos, sin estados ni pasarela. Hotfix sin red de seguridad.                              | Deliberada – Temeraria     | Mantenibilidad (Testeabilidad)                                | 24 h                                       | USD 4,533 / mes (INC-0815)        |
| **DT-06** | `L25`, `L115`, `L135`, `server.js` (batch)       | Desempeño                      | `readFileSync`/`writeFileSync` dentro de bucles: bloquea el Event Loop.                                                      | Deliberada – Temeraria     | Eficiencia de desempeño (Comportamiento temporal)             | 8 h                                        | USD 5,243 / mes (INC-0718)        |
| **DT-07** | `L58–L99`, `L127`                                | Código (_Primitive Obsession_) | Dinero como `number` IEEE-754; totales con 4 decimales (361.4881).                                                           | Inadvertida – Temeraria    | Adecuación funcional (Exactitud)                              | 10 h                                       | USD 2,060 / mes (INC-0912)        |
| **DT-08** | `server.js` (catch de rutas)                     | Seguridad                      | `stack` y `message` internos devueltos al cliente; sin validación de entrada; `forceRetry` aceptado sin filtro.              | Inadvertida – Temeraria    | Seguridad (Confidencialidad)                                  | 5 h                                        | Riesgo no cuantificado            |
| **DT-09** | (ausente)                                        | Proceso / CI-CD                | Sin pipeline, sin _quality gates_, sin protección de `main`.                                                                 | Deliberada – Temeraria     | Mantenibilidad (Modificabilidad, Testeabilidad)               | 6 h                                        | Habilitador (previene INC-0815)   |
|           |                                                  |                                | **Totales**                                                                                                                  |                            |                                                               | **142 h**                                  | **USD 18,905 / mes**              |

**Distribución Fowler:** Deliberada-Temeraria 5, Inadvertida-Temeraria 3, Inadvertida-Prudente 1, Deliberada-Prudente 0 (esta última aparece sólo en las decisiones del §4.2).

---

## 3. Análisis Forense de Incidentes y Cuantificación de "Intereses"

### 3.0 Reproducción del cobro duplicado (hallazgo técnico)

`npm run simulate` dispara 5 llamadas "simultáneas". Como `processSubscriptionBilling` es 100 % síncrona, cada callback del temporizador se ejecuta completo antes del siguiente: **no hay entrelazado de lectura/escritura**; cada llamada lee el archivo ya actualizado por la anterior y cobra otra vez. La causa raíz exacta es **ausencia de idempotencia** (nada recuerda que el período ya fue cobrado). La condición de carrera "clásica" (_lost update_) aparece en cuanto la escritura sea asíncrona o haya más de un proceso/réplica, que es el escenario de producción de INC-0704. Resultado: 5 de 5 cobros, saldo ≈ USD 1,771.74 (1 × 325.7881 + 4 × 361.4881) y totales con decimales sub-centavo.

### 3.1 Impacto Acumulado de la Inacción (Costo de los Intereses)

| Incidente     | Downtime (h) | Pérdida (USD) | Horas ing. |  Clientes | Deuda raíz    |
| :------------ | -----------: | ------------: | ---------: | --------: | :------------ |
| INC-2026-0704 |          3.5 |         8,750 |         26 |       142 | DT-03         |
| INC-2026-0718 |          6.0 |        14,200 |         34 |       820 | DT-06         |
| INC-2026-0802 |          2.0 |         6,300 |         18 |       310 | DT-04         |
| INC-2026-0815 |          4.5 |        11,800 |         40 |        95 | DT-05 / DT-01 |
| INC-2026-0829 |          1.0 |         3,500 |         15 |         0 | DT-02         |
| INC-2026-0912 |          0.0 |         4,920 |         28 |       530 | DT-07         |
| **Total**     |     **17.0** |    **49,470** |    **161** | **1,897** |               |

- **Total Horas de Indisponibilidad (Downtime):** `17.0 h`
- **Pérdida Financiera Directa en Reembolsos/Penalizaciones:** `$49,470 USD`
- **Horas de Ingeniería Desperdiciadas en "Apagar Incendios":** `161 h` × USD 45 = `$7,245 USD`
- **Interés trimestral total:** 49,470 + 7,245 = **USD 56,715** → **USD 18,905 / mes**

### 3.2 Cálculo Matemático del Technical Debt Ratio (TDR)

$$ \text{TDR} = \frac{\text{Costo de Remediación (Principal)}}{\text{Costo Total de Desarrollo del Sistema}} \times 100 $$

- **Principal total inicial ($P$):** 142 h × USD 45/h = **USD 6,390**
- **Costo de reconstrucción ($C$):** 400 h × USD 45/h = **USD 18,000** (análisis 60 h + diseño 60 h + implementación 140 h + pruebas 80 h + despliegue/operación 40 h + gestión/documentación 20 h; supuesto del equipo, ajustable).
- **TDR inicial:** 6,390 / 18,000 × 100 = **35.5 %** (calificación D en escala SQALE: 20–50 %).
- **Principal pagado en Sprints 1–2:** 106 h = **USD 4,770**.
- **Principal residual registrado (TDR-DEC-01 + TDR-DEC-02):** 36 h = USD 1,620 → **TDR final = 9.0 %** (calificación B). Al pagar ambas decisiones el TDR llega a ≈ 0 %, cumpliendo la meta < 5 %.

**ROI.** Con eliminación del 100 % de los intereses, el pago se amortiza en 4,770 / 18,905 = **0.25 meses (≈ 8 días)**. Con un supuesto conservador de 80 % de reducción: 4,770 / (18,905 × 0.8) = **0.32 meses (≈ 10 días)**. Retorno del primer trimestre: (56,715 × 0.8 − 4,770) / 4,770 = **≈ 851 %**.

---

## 4. Matriz de Priorización y Registro de Deuda Táctica

### 4.1 Matriz de Priorización (Impacto en Negocio vs. Esfuerzo)

```text
       ALTO IMPACTO
            ▲
            │  QUICK WINS (hacer ya)                     PROYECTOS ESTRATÉGICOS
            │  DT-02 Secretos (3 h)  -> Sprint 1         DT-05 Red de pruebas (24 h) -> Sprint 1 (primero)
            │  DT-06 I/O async (8 h) -> Sprint 1         DT-03 Idempotencia + lock (16 h) -> Sprint 1
            │  DT-07 Money VO (10 h) -> Sprint 1         DT-01 God Method -> hexagonal (20 h) -> Sprint 1
            │  DT-08 Hardening HTTP (5 h) -> Sprint 2    DT-04 Resiliencia pasarela (14 h) -> Sprint 2
            │
            │  HABILITADOR                               DEUDA ASUMIDA (registro formal)
            │  DT-09 Quality Gates CI (6 h) -> Sprint 2  TDR-DEC-01 (16 h), TDR-DEC-02 (20 h) -> Sprints 4-5
            └────────────────────────────────────────────────────────►
           BAJO ESFUERZO                                     ALTO ESFUERZO
```

- **Sprint 1 (81 h):** DT-05, DT-02, DT-06, DT-07, DT-03, DT-01. **Sprint 2 (25 h):** DT-08, DT-09, DT-04 (parcial). Total pagado: 106 h.
- **Regla de orden:** DT-05 antecede a cualquier cambio de negocio (red de seguridad).

### 4.2 Registro de Deuda Táctica Deliberada (Technical Debt Register)

| Campo                                   | TDR-DEC-01                                                                                                                                           | TDR-DEC-02                                                                                                                                   |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decisión Técnica**                    | Mantener `MockPaymentGateway` (stub en memoria) y diferir el adaptador real de pasarela con _circuit breaker_ y backoff.                             | Mantener persistencia en archivo JSON (escritura atómica + cola + mutex en proceso) y diferir la migración a PostgreSQL con bloqueo de fila. |
| **Cuadrante Fowler**                    | Deliberada – Prudente                                                                                                                                | Deliberada – Prudente                                                                                                                        |
| **Justificación de Negocio**            | Liberar el congelamiento de despliegues ya; el contrato de pago está aislado tras `PaymentGatewayPort`, por lo que el cambio futuro no toca dominio. | La corrección del cobro duplicado es urgente; una migración de datos con ventana de mantenimiento no cabe en el Sprint 1.                    |
| **Riesgo Asumido**                      | Sin tolerancia real a degradación del proveedor (INC-0802 podría repetirse en producción real).                                                      | Con más de una réplica los locks en memoria no coordinan; el volumen de archivo no escala.                                                   |
| **Medida de Mitigación Temporal**       | Suspensión automática tras 3 fallos, llave de idempotencia hacia la pasarela, alerta en Slack ante `GATEWAY_TIMEOUT`.                                | Desplegar **una sola réplica**; llave de idempotencia por período también en la pasarela; respaldo diario del archivo.                       |
| **Principal**                           | 16 h (USD 720)                                                                                                                                       | 20 h (USD 900)                                                                                                                               |
| **Fecha Límite de Pago (Debt Ceiling)** | Sprint 4 – **18/12/2026**, o antes de conectar una pasarela real                                                                                     | Sprint 5 – **29/01/2027**, o antes de pasar a > 1 réplica / > 10,000 suscripciones                                                           |

---

## 5. Arquitectura de Remediación y Red de Seguridad

### 5.1 Red de Seguridad: Pruebas de Caracterización (Golden Master)

- Archivo de pruebas creado: `test/characterization.test.js` (+ `test/helpers/goldenMaster.js`, `test/fixtures/goldenCases.js`). Commit previo a cualquier cambio de negocio: `677e603` (posterior al baseline `9ff4410` y anterior al refactor `9724a9a`).
- Casos de borde caracterizados: umbral estricto `> 200` en CO; recargo MX sólo con `WIRE_TRANSFER`; carga AR del 56 % + 12.5; país no documentado al 10 %; descuentos ENTERPRISE_PLUS anual (15 %) y mensual (25 plano); promo `FAST2026` sólo en ENTERPRISE; `forceRetry` estricto (`=== true`); transiciones ACTIVE/SUSPENDED/CANCELLED; `retryCount` y suspensión al 3.er fallo; `retryCount` no se reinicia tras éxito; persistencia sin tocar otras suscripciones.
- Defectos documentados (no requisitos): total sin redondeo, doble cobro, clave secreta en log.
- **La misma suite se ejecuta contra el motor refactorizado** (`test/characterization.refactored.test.js`), demostrando equivalencia de reglas.

**Desviaciones intencionales respecto al legado**

| ID    | Cambio                                                                             | Justificación                                          |
| :---- | :--------------------------------------------------------------------------------- | :----------------------------------------------------- |
| DV-01 | Importes redondeados al centavo (half-up)                                          | Elimina DT-07; diferencia máxima observada < USD 0.005 |
| DV-02 | Descuento limitado al importe base                                                 | El legado podía generar totales negativos              |
| DV-03 | Segundo cobro del mismo período = _replay_ (`BILLING_ALREADY_PROCESSED`, HTTP 200) | Elimina DT-03                                          |
| DV-04 | Errores 500 sin `stack`/`message`, con `correlationId`                             | Elimina fuga de información (DT-08)                    |

### 5.2 Estructura Hexagonal Implementada

```text
src/
├── domain/            # Money (VO), Subscription, TaxPolicy, DiscountPolicy, BillingCalculator, billingPeriod  (sin fs, sin Express, sin reloj)
├── application/       # ProcessBillingUseCase, BatchBillingUseCase, ListSubscriptionsUseCase
├── ports/             # PaymentGatewayPort, SubscriptionRepositoryPort, LockManagerPort
├── infrastructure/    # FileSubscriptionRepository, InMemorySubscriptionRepository, InMemoryLockManager,
│   │                  # MockPaymentGateway, config (variables de entorno)
│   └── http/          # createApp (controlador Express)
└── server.js          # Composition root
legacy/                # Motor original congelado (sólo como referencia del Golden Master; excluido del linter)
```

Regla de dependencia: `infrastructure → application → domain`; los puertos son contratos consumidos por `application`.

### 5.3 Principios SOLID y Patrones Aplicados

- **SRP:** el _God Method_ se descompuso en `BillingCalculator` (cálculo), `Subscription` (reglas de estado), `ProcessBillingUseCase` (orquestación), repositorio (persistencia) y gateway (pago).
- **OCP:** nuevos países/descuentos se agregan como reglas (`DEFAULT_TAX_RULES`, `DEFAULT_DISCOUNT_RULES`) o inyectando una `TaxPolicy` propia, sin modificar el núcleo (probado con el país ficticio "PE").
- **DIP:** el caso de uso depende de puertos; el _composition root_ decide los adaptadores.
- **Value Object:** `Money` guarda centavos enteros, es inmutable, valida moneda y redondea con enteros (`percentage` en puntos básicos).
- **Idempotencia / Lock transaccional:** (1) `InMemoryLockManager.runExclusive("billing:<id>")` serializa la sección crítica por suscripción; (2) `Subscription.isBilledIn(periodo)` convierte el reintento en _replay_; (3) `idempotencyKey = <id>:<período>` hacia la pasarela; (4) el repositorio serializa lectura-modificación-escritura y escribe de forma atómica (temp + rename).
- **Secretos:** sólo por entorno (`.env`, `.env.example`, `.gitignore`). La clave histórica debe considerarse **comprometida y rotarse**.

---

## 6. Verificación de Quality Gates en GitHub Actions

### 6.1 Workflow de CI Implementado

[`.github/workflows/quality-gate.yml`](./.github/workflows/quality-gate.yml) — se ejecuta en `push` y `pull_request` a `main`:

- **Gate 1:** `npm run lint` (`--max-warnings=0`, complejidad ≤ 8).
- **Gate 2:** `npm audit --audit-level=high`.
- **Gate 3 y 4:** `npm run test:coverage` (pruebas + umbral 80 % líneas/ramas/funciones en dominio y aplicación; falla si no se cumple).
- **Job agregador `Quality Gate`:** único check requerido en la protección de rama (`Settings → Branches → Require status checks`).

### 6.2 Evidencias de Bloqueo y Aprobación

1. **Pull Request Bloqueado:** `[enlace del PR / captura]` — fallo deliberado: `[p. ej. función con complejidad 10 en src/domain]`. Run fallido: `[enlace]`.
2. **Pull Request Exitoso:** `[enlace del PR / captura]` — todos los checks en verde y merge permitido. Run exitoso: `[enlace]`.

Salida final de `npm run test:coverage` (121 pruebas, 0 fallos):

```text
file                            | line % | branch % | funcs %
 application/BatchBillingUseCase.js      | 100.00 | 100.00 | 100.00
 application/ListSubscriptionsUseCase.js | 100.00 | 100.00 | 100.00
 application/ProcessBillingUseCase.js    | 100.00 | 100.00 | 100.00
 domain/BillingCalculator.js             | 100.00 | 100.00 | 100.00
 domain/billingPeriod.js                 | 100.00 | 100.00 | 100.00
 domain/DiscountPolicy.js                | 100.00 | 100.00 | 100.00
 domain/Money.js                         | 100.00 | 100.00 | 100.00
 domain/Subscription.js                  | 100.00 | 100.00 | 100.00
 domain/TaxPolicy.js                     | 100.00 | 100.00 | 100.00
all files                                | 100.00 | 100.00 | 100.00
```

Verificación del cobro duplicado (`npm run simulate:fixed`): 1 cobro real de 5 intentos, 4 _replays_ con la misma referencia, saldo final USD 325.79 (frente a 5 de 5 cobros y ≈ USD 1,771.74 en el legado).

---

## 7. Conclusiones y Gobernanza Continua (ISO/IEC/IEEE 12207)

1. **Prevención de deuda inadvertida.** La arquitectura hexagonal impide que Express, `fs` o el reloj se filtren al dominio, de modo que las reglas de negocio se prueban en milisegundos y sin mocks complejos (Testeabilidad, Modularidad). `Money` hace imposible por construcción sumar floats o mezclar monedas, y las reglas por país/descuento son datos extensibles (OCP), no ramas `if` dentro de una función gigante. Los _gates_ convierten estas prácticas en un contrato verificable en cada PR.
2. **Fecha límite agresiva para una nueva pasarela.** Procedimiento: (a) abrir un ítem en el _Technical Debt Register_ con ID, decisión, justificación de negocio, riesgo y mitigación; (b) clasificarlo Deliberada-Prudente exigiendo que se conserve la red de pruebas, que el atajo quede detrás de un puerto y que no se baje ningún umbral del _gate_; (c) aprobación explícita del Product Owner y del líder técnico; (d) fijar _Debt Ceiling_ con fecha y disparadores (volumen, réplicas); (e) revisar el registro en cada _sprint review_. Deuda negligente sería la que se toma sin registro, sin tests o sin fecha de pago (como INC-0815).
3. **Argumento al CFO.** Hoy la deuda cuesta **USD 18,905/mes** en intereses. Suponiendo un equipo de 5 personas (≈ 400 h/sprint, 2 sprints/mes), reservar el 20 % son 160 h/mes = **USD 7,200/mes**. Basta con eliminar el 38 % de los intereses (7,200 / 18,905) para empatar; con la reducción esperada del 80 % el ahorro neto es ≈ **USD 7,900/mes** (15,124 − 7,200), además de menor rotación (60 %), cero congelamientos de despliegue y menor exposición regulatoria. El pago inicial de USD 4,770 se recupera en ≈ 10 días.

---

### Anexo A. Resultados esperados de verificación local

Resultados obtenidos: `npm test` → 121 pruebas, 0 fallos · `npm run test:coverage` → 100 % en dominio y aplicación · `npm run lint` → 0 problemas · `npm run simulate:fixed` → "Cobros reales ejecutados: 1 de 5", saldo final USD 325.79.
