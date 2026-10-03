# Log — identiteit, synchronisatie en samenwerking v2

## Doel

De 12-tekenidentifier die in QR-codes of links zichtbaar is, is voortaan **alleen een publieke alias**. De alias bewijst niet wie iemand is en geeft niet automatisch schrijf- of leesrechten.

De basisregel is:

**Identiteit → object → relatie → recht → revisie → handeling.**

Dit model geldt voor kaarten, locaties, thema's, acties, gesprekken, taken/tijdregistraties, ritten en auto's.

## Identiteiten

### PersonId

Iedere Log-installatie heeft één eigen `personId` van exact 12 tekens uit `A-Z a-z 0-9 - _`.

- `personId` is de blijvende Log-identiteit van de gebruiker.
- De lokale persoon-ID (`colleague.id`) mag een UUID blijven en mag per installatie verschillen.
- `personId` wordt niet als autorisatietoken gebruikt.
- Contactpersonen kunnen later hun eigen `personId` krijgen zodra een relatie/samenwerking is bevestigd.

### VehicleId

De auto krijgt een eigen `vehicleId` van exact 12 tekens.

- `vehicleId` hoort bij het voertuig en niet bij de bestuurder.
- Meerdere personen kunnen hetzelfde voertuig gebruiken.
- Iedere rit legt minimaal `vehicleId` en `driverPersonId` vast.
- Gebeurtenissen zoals tanken leggen minimaal `vehicleId` en `actorPersonId` vast.

De huidige app kent nog één voertuig in `settings`. In v2 wordt dat voertuig alvast van een vaste `vehicleId` voorzien. Dit maakt een latere migratie naar meerdere voertuigen mogelijk zonder bestaande ritten opnieuw te identificeren.

### ObjectId

Een gedeeld object behoudt zijn eigen bronidentiteit. De zichtbare QR-/deelcode is niet die bronidentiteit.

Voorbeeld:

```text
private objectId  -> interne bron
publicAlias       -> 12 tekens, willekeurig, zichtbaar in QR/link
collaborationId   -> interne relatie/samenwerking
```

De mapping wordt lokaal en/of server-side privé gehouden.

## Rechten

Rechten worden per deelnemer vastgelegd en nooit uit de zichtbare identifier afgeleid.

Minimale rechten:

- `view`
- `use`
- `write`
- `share`
- `copy`
- `offline`
- `accept`

De eigenaar heeft daarnaast:

- deelnemers toevoegen/verwijderen;
- rechten wijzigen;
- de gehele samenwerking beëindigen (`revoke`).

Een deelnemer kan, als het recht `offline` is toegestaan, de tijdelijke online payload verwijderen nadat iedereen de revisie heeft opgehaald. Dit beëindigt de samenwerking niet.

## Online bron is tijdelijk

De blijvende samenwerking zit op de apparaten; de server is een **tijdelijke brievenbus**.

1. A en B hebben lokaal dezelfde samenwerking en objectidentiteit.
2. Er hoeft geen payload online te staan.
3. A maakt een wijziging en publiceert revisie 18.
4. B ziet dat revisie 18 beschikbaar is en haalt hem op.
5. Zodra de deelnemers synchroon zijn, kan de payload weer offline.
6. De alias blijft gereserveerd voor een volgende revisie.

De QR-code hoeft dus niet bij iedere revisie te veranderen.

## Beëindigen door eigenaar

`offline` en `revoke` zijn verschillende acties.

### Offline

- payload verdwijnt;
- samenwerking blijft actief;
- lokale inhoud blijft toegankelijk;
- een volgende revisie kan onder dezelfde samenwerking worden gepubliceerd.

### Revoke

- alleen eigenaar kan dit voor de volledige samenwerking uitvoeren;
- serverstatus wordt `revoked`;
- payload verdwijnt;
- deelnemers mogen niet meer publiceren of synchroniseren;
- zodra een verbonden client deze status ziet, vergrendelt Log de gedeelde inhoud en verwijdert de actieve ontsleutelsleutel uit de normale lokale opslag;
- de gebruiker ziet alleen dat de samenwerking door de eigenaar is beëindigd.

Een reeds buiten Log gemaakte kopie, export, screenshot of foto kan uiteraard niet technisch worden teruggehaald.

## Gesprekken

Een gesprek is een object binnen een samenwerking:

```text
conversation
- collaborationId
- participants[]
- messages[]
- linkedObjectIds[]
- revisions[]
```

Berichten kunnen verwijzen naar een object of revisie. Hierdoor kan Log later tonen: “A wijzigde taak X in revisie 14” in plaats van alleen vrije chat.

## Tijd, taken en validatie

Een tijdregistratie bevat in v2 minimaal:

```text
entry.id
ownerPersonId
participantPersonIds[]
validation.requiredFrom[]
validation.acceptedBy[]
validation.rejectedBy[]
```

Wanneer persoon A een activiteit/tijd aan persoon B koppelt:

1. A blijft auteur/eigenaar van de registratie.
2. B krijgt alleen die activiteit in beeld die aan B is toegewezen; niet automatisch A's volledige urenregistratie.
3. De status start op `pending`.
4. B kan accepteren of afwijzen als `accept` is toegestaan.
5. Na acceptatie staat B in `acceptedBy`.
6. De uren kunnen vervolgens als door B gevalideerd worden weergegeven.

Een wijziging na acceptatie maakt de betreffende validatie opnieuw `pending`, tenzij alleen niet-inhoudelijke metadata wijzigt.

## Ritten en gedeelde auto

Een rit bevat:

```text
trip.id
vehicleId
driverPersonId
createdByPersonId
```

Een gedeelde auto heeft deelnemers met bijvoorbeeld:

```text
owner: view, use, write, share, offline
user:  view, use, write
```

Als B de auto gebruikt, registreert B de rit op zijn eigen apparaat. De rit wordt gekoppeld aan dezelfde `vehicleId` maar aan `driverPersonId = B`.

Hierdoor kan een voertuigregistratie worden opgebouwd uit registraties van meerdere bestuurders zonder dat zij elkaars volledige persoonlijke Log hoeven te delen.

## Persoonlijke back-up

De persoonskaart wordt tevens het anker voor apparaat-overdracht.

Een volledige persoonlijke back-up kan bevatten:

- ritten en GPS-punten;
- tijdregistraties en taken;
- thema's en subthema's;
- locaties;
- kaarten;
- acties;
- personen/contactkoppelingen;
- voertuigidentiteiten;
- samenwerkingsmetadata.

De back-up wordt **client-side versleuteld** met een wachtwoord voordat hij online wordt geplaatst. De server bewaart alleen de versleutelde payload en synchronisatiemetadata.

Herstel:

1. nieuwe telefoon opent “Mijn Log herstellen”;
2. herstelcode/QR wordt ingevoerd of gescand;
3. wachtwoord wordt ingevoerd;
4. payload wordt lokaal ontsleuteld;
5. bestaande vaste identifiers blijven behouden.

## Statusweergave

- geen bolletje: alleen lokaal;
- groen: lokaal gelijk aan bekende revisie;
- pulserend grijs/groen: lokale wijziging klaar om te publiceren;
- oranje: nieuwere revisie van een ander beschikbaar;
- grijs: samenwerking actief maar payload offline;
- rood/vergrendeld: samenwerking ingetrokken.

## Migratie vanuit huidige testversie

De bestaande 12-teken `configurationId` blijft voor bestaande gedeelde configuraties bruikbaar als publieke alias. Hij wordt niet langer beschouwd als bewijs van deelname of schrijfrecht.

De bestaande lokale 8-teken kaart-ID's blijven ongewijzigd.

Nieuwe implementatievolgorde:

1. `personId` en `vehicleId` invoeren;
2. ritten/tijdregels voorzien van deze identiteiten;
3. versleutelde persoonlijke back-up;
4. server-side deelnemer/rechtenmodel;
5. taken delen + accepteren/afwijzen;
6. voertuig delen + ritten door meerdere bestuurders;
7. gesprekken en revisiegerichte communicatie;
8. bestaande configuratiedeling migreren naar dezelfde rechtenlaag.

Productie/live wordt tijdens deze ontwikkeling niet gewijzigd.
