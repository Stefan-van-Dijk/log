# Release 0.40.1 — Herhalende schermupdates

Status: geïmplementeerd in live broncode op 5 oktober 2026.

- De gedeelde updatestatus schrijft tekst alleen wanneer deze verandert. De brede schermbewaker activeert daardoor niet meer zijn eigen volgende update.
- De update-instellingen passen zichtbaarheid, stijl en oude attributen alleen bij een werkelijke verandering aan. Ook een bestaande updatebadge wordt alleen bij gewijzigde zichtbaarheid aangepast.
- De archief-back-upmodule schrijft geen testversie meer naar de live interface en heeft daarvoor geen schermbewaker meer. De bestaande centrale live versieweergave blijft leidend; archiefexport en herstel blijven beschikbaar.
- Live build en offline cache gaan naar 0.40.1, zodat apparaten de gewijzigde bestanden opnieuw laden.
- Gerichte regressie: echte DOM-schermbewakers komen tot rust na openen, beleidswijzigingen, herstel van zichtbaarheid, opnieuw opbouwen en hervatten. De archiefexport behoudt zijn gegevens.

GPS-intervallen, actiecontrole en netwerkcontrole vallen buiten deze reparatie. Warmte en vloeiendheid op een iPhone moeten in de praktijk worden beoordeeld.
