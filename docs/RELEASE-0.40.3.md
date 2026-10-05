# Log 0.40.3 — minder onnodige activiteit

WARMTE-01 blijft open totdat het effect op een echte telefoon is gecontroleerd. Deze wijziging verlaagt aangetroffen onnodige appactiviteit; er is geen temperatuur- of batterijmeting gedaan.

- Locatie-acties verwerken niets zolang Log verborgen is. Hun terugkerende controle stopt bij verbergen/pagehide en hervat bij terugkeer, met maximaal één timer. Zonder GPS-punt wordt geen opgeslagen actiegeschiedenis verwerkt. De controle van acties/wachttijden draait zichtbaar iedere vijf seconden in plaats van iedere seconde; aanbiedingen kunnen daardoor maximaal vijf seconden later verschijnen. De GPS-frequentie blijft afzonderlijk geregeld.
- Normale knoppen/navigatie tijdens een rit hergebruiken het GPS-punt maximaal één minuut, in plaats van na tien seconden opnieuw nauwkeurige GPS aan te vragen. De nauwkeurige ritmeting blijft iedere minuut. Expliciete locatie-afhankelijke handelingen kunnen nog steeds een versere meting vragen.
- De snelle verbindingscontrole behandelt alleen uitstaande verzoeken. Bevestigde verbindingen gebruiken de bestaande reguliere minuutcontrole. Ongewijzigde revisies worden niet opnieuw ontsleuteld/opgeslagen wanneer de lokale cache al aanwezig is; intrekken blijft eerst gecontroleerd.
- De lopende taakklok verandert geen schermtekst wanneer de app verborgen is of de kilometermodule actief is. De duur wordt uit de oorspronkelijke begintijd berekend, dus de taak loopt door.

Controle: `npm run verify` en `npm run verify:energy`. De energiecontroles laden de echte app met lokale modules en nagebootste server/GPS-antwoorden. Ze controleren achtergrondactiviteit, GPS-hergebruik en hervatten, uitnodigingen, caches en intrekken. Geen live gebruikersgegevens of externe writes tijdens tests.

De volledige app gaf vóór de wijziging in een testvenster van 2,2 seconden 24 storage-reads op de achtergrond; na de wijziging nul, met nul schermmutaties. Dat meet codeactiviteit in deze fixture, geen CPU-percentage, energie of temperatuur op iOS.

Controle op een telefoon: herlaad tot 0.40.3 zichtbaar is, test enkele minuten zonder actieve rit/taak, vervolgens dezelfde gebruikssituatie waarin warmte optrad. Noteer of een rit/taak actief was en of aanvullende automatische locatiecontrole aan stond. Laat achtergrond/hervatten en behoud van GPS-punten ook meewegen.

Deze app-update vereist geen FTP-upload. Het afzonderlijke serverpakket 2026-10-05.1 blijft voorbereid; het is niet opgenomen in deze app-publicatie.
