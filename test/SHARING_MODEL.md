# Log — delen en samenwerken

> Dit document vervangt het eerdere model waarin kennis van een 12-tekenidentifier automatisch samenwerkingsrecht gaf. Dat model geldt niet meer voor nieuwe ontwikkeling.
>
> De volledige technische uitwerking staat in `IDENTITY_COLLABORATION_V2.md`.

## Kernregel

Een zichtbare identifier is alleen een **willekeurige publieke alias**. De alias bevat geen private bron-ID en verleent op zichzelf geen rechten.

Nieuwe basis:

**Identiteit → object → relatie → recht → revisie → handeling.**

Log onderscheidt daarom minimaal:

- `personId`: wie de gebruiker is;
- private object-ID: welk object het inhoudelijk is;
- publieke alias: wat in QR/link mag staan;
- samenwerking: welke personen aan een object gekoppeld zijn;
- rechten: wat iedere deelnemer met dat object mag doen;
- revisie: welke versie lokaal/online bekend is.

## PersonId

Iedere gebruiker krijgt een vaste `personId` van 12 tekens uit `A-Z a-z 0-9 - _`.

De lokale persoon-ID mag per apparaat verschillen. Een `personId` is geen wachtwoord of toegangstoken.

## Publieke alias

Een gedeeld object krijgt een willekeurige alias van 12 tekens.

De alias:

- blijft bij dezelfde samenwerking gelijk;
- is geschikt voor QR/link;
- is niet afgeleid van de private object-ID;
- geeft zonder deelnemer/token geen schrijf- of beheersrecht.

## Rechten

Per deelnemer kunnen minimaal deze rechten gelden:

- bekijken;
- gebruiken;
- wijzigen/publiceren;
- verder delen;
- kopiëren;
- online payload verwijderen;
- accepteren/valideren.

De eigenaar kan deelnemers/rechten beheren en de volledige samenwerking beëindigen.

## Online payload als tijdelijke brievenbus

De samenwerking blijft lokaal op de apparaten bestaan. De online payload hoeft niet permanent aanwezig te zijn.

1. A en B hebben dezelfde samenwerking lokaal.
2. A publiceert een nieuwe revisie onder dezelfde alias.
3. B ziet de nieuwere revisie en haalt hem op.
4. A of B kan — als dit recht is toegekend — de online payload daarna verwijderen.
5. De alias blijft gereserveerd voor een volgende revisie.

`offline` beëindigt de samenwerking dus niet.

## Beëindigen door eigenaar

`revoke` is definitief voor die samenwerking.

Wanneer een verbonden deelnemer ziet dat de samenwerking is ingetrokken:

- kan hij niet meer synchroniseren/publiceren;
- wordt de gedeelde inhoud in Log vergrendeld/verwijderd;
- worden normale lokale toegangssleutels niet meer gebruikt;
- blijft alleen de melding zichtbaar dat de eigenaar de samenwerking heeft beëindigd.

Een buiten Log gemaakte export, screenshot of andere kopie kan technisch niet worden teruggehaald.

## Taken en uren

Een activiteit kan aan een andere `personId` worden voorgelegd.

De ontvanger ziet hem eerst als **Ter goedkeuring**. De uren worden pas als door die persoon geaccepteerd beschouwd wanneer hij expliciet accepteert.

De server behandelt acceptatie als apart recht; een ontvanger hoeft daarvoor niet het volledige taakobject te mogen herschrijven.

Na een inhoudelijke nieuwe revisie vervalt een eerdere acceptatie en wordt opnieuw bevestiging gevraagd.

## Auto en ritten

Een auto heeft een vaste `vehicleId` die losstaat van de bestuurder.

Iedere rit legt vast:

- `vehicleId`;
- `driverPersonId`;
- `createdByPersonId`.

Een andere deelnemer kan dezelfde auto als actieve auto gebruiken en nieuwe ritten voor dezelfde `vehicleId` registreren. De gezamenlijke voertuigregistratie kan ritten van meerdere bestuurders bevatten zonder dat hun volledige persoonlijke rittenadministratie samengevoegd hoeft te worden.

## Persoonlijke back-up

De persoonsidentiteit is ook het anker voor een versleutelde online back-up van Log.

De volledige back-up kan ritten, GPS, tijd/taken, thema's, locaties, kaarten, acties, personen, voertuigidentiteiten en samenwerkingsmetadata bevatten.

Versleuteling gebeurt client-side met een wachtwoord voordat de payload naar de server gaat.

## Huidige testimplementatie

Test bevat nu:

- `identity-sync.js`: PersonId, VehicleId, registratieverrijking en versleutelde persoonlijke back-up;
- `collaboration-v2.js`: taken/uren, voertuigdeling, gesprekken, uitnodigingen, rechten, offline/revoke en acceptatie;
- `server/sync.php`: referentie-endpoint voor versleutelde payloads, deelnemers, rechten en acknowledgements;
- `tests/collaboration-v2-regression.cjs`: gerichte regressie-/syntaxchecks.

De bestaande `publish.php`/`log-config`-route blijft voorlopig beschikbaar voor oudere gedeelde configuraties. Nieuwe samenwerking wordt stapsgewijs naar v2 gemigreerd.

## Infrastructuur

Voor werkende online v2-synchronisatie moet `test/server/sync.php` op de server beschikbaar zijn als:

`https://sharon.life/log/api/sync.php`

De testclient verwijst uitsluitend naar dit endpoint. Live/productie wordt hiermee niet aangepast.
