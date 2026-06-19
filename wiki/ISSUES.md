# Creazione Issue

Guida al processo di apertura delle issue su questo repository.

## Formato del titolo

```
<Prefisso>: <descrizione breve>
```

La descrizione deve essere concisa, **max 20 caratteri**.

| Tipo | Prefisso | Esempio |
|---|---|---|
| Bug | `Fix:` | `Fix: Login redirect loop` |
| Nuova feature | `Feature:` | `Feature: Dark mode` |
| Miglioramento esistente | `Enhance:` | `Enhance: Portfolio chart` |
| Manutenzione / refactor | `Maintenance:` | `Maintenance: Auth middleware` |
| Domanda / discussione | `Question:` | `Question: FX rate source` |
| Riepilogo sprint / stato | `Summary:` | `Summary: Sprint 3` |

---

## Corpo della issue

```markdown
## Descrizione
<Cosa succede / cosa manca / cosa si vuole ottenere>

## Comportamento atteso
<Come dovrebbe funzionare>

## Comportamento attuale
<Come funziona adesso — solo per Bug>

## Steps to reproduce
<Solo per Bug — lista numerata>

## Note
<Contesto aggiuntivo, screenshot, link — opzionale>
```

> Le sezioni **Comportamento attuale** e **Steps to reproduce** si usano solo per le issue di tipo `Type::Bug`.

---

## Assignees

Assegnare sempre almeno uno tra:

- `NacciVittorio`
- `itsNiccoloSabatini`

---

## Labels

Scegliere le label più appropriate tra quelle disponibili:

| Categoria | Labels |
|---|---|
| Tipo | `Type::Bug` `Type::NewFeature` `Type::Enhancement` `Type::Maintenance` `Type::Question` `Type::Summary` |
| Priorità | `Priority::Higher` `Priority::Medium` `Priority::Lower` |
| Stato | `Blocked` `FutureReference` |
| Risoluzione | `Resolution::Fixed/Done` `Resolution::Won'tFix` `Resolution::Duplicate` `Resolution::ByDesign` `Resolution::NotReproducible` `Resolution::NotApplicable` `Resolution::External` `Resolution::Answered` `Resolution::ReviewNeeded` |

Applicare sempre almeno una label `Type::*` e una `Priority::*`.

---

## Milestone

Verificare se la issue rientra in una milestone attiva e assegnarla se pertinente.

---

## Branch

Una volta aperta la issue, creare il branch collegato direttamente da GitHub:

```bash
gh issue develop <number> --checkout
```

Il nome del branch viene generato automaticamente da GitHub a partire dal titolo della issue.
