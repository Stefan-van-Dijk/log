# Log 0.40.4 — locatie delen zonder voortdurend herhalen

Aanleiding: de telefoon bleef warm zonder actieve rit of taak, terwijl meerdere locatie-acties aanwezig waren. WARMTE-01 blijft open: deze release vermindert gemeten codeactiviteit; temperatuur en energie op de telefoon zijn niet gemeten.

- Locatie-acties gebruiken één geplande controle voor alle acties. De vaste vijfsecondenlus vervalt. Nieuwe GPS-metingen en gewijzigde gegevens plannen verwerking; tijdvensters worden op minuutgrenzen gecontroleerd en wachttijden op hun concrete eindmoment. Alleen een al gereedstaand voorstel dat nog wacht, wordt zo nodig iedere vijf seconden opnieuw bekeken. Zonder relevante acties of zichtbare status is geen actietimer nodig.
- Verbergen/pagehide stopt de geplande actiecontrole. Hervatten en een nieuwe meting zetten maximaal één planning terug. Zonder GPS blijft handmatige bediening mogelijk.
- Het locatiescherm en de opstart van locatie-acties hergebruiken een centrale meting tot één minuut oud. Een uitgeschakelde periodieke interval wordt niet meer als cacheduur nul gebruikt, wat eerder een onnodige nieuwe meting kon veroorzaken.
- De handmatige functie 'kaarten in de buurt' gebruikt dezelfde centrale locatievoorziening, met een cacheduur van dertig seconden. Die functie vraagt niet meer rechtstreeks de browser-GPS op.
- De nauwkeurige minuutmeting tijdens een rit en expliciet opnieuw controleren blijven bestaan. Aanvullende automatische locatiecontrole behoudt de gekozen instelling. Locatie-acties zijn niet uitgeschakeld.

Validatie: `npm run verify` en `npm run verify:energy`. De uitgebreide app-test simuleert geslaagde GPS, een thuislocatie, twaalf actieve locatie-acties en geen lopende rit/taak. Het startscherm blijft zonder schermmutaties; thuis, het locatiescherm en kaarten in de buurt gebruiken in die test één GPS-aanvraag. Een aparte tijdgestuurde test controleert twaalf acties, exacte afloop van een wachttijd, maximaal één timer en pauzeren op de achtergrond. Bestaande export/herstel-, scherm- en GPS-puntencontroles blijven slagen. Geen live gegevens of externe writes tijdens tests.

Deze clientupdate vereist geen FTP-upload. Het serverpakket 2026-10-05.1 is afzonderlijk voorbereid en blijft buiten deze publicatie.
