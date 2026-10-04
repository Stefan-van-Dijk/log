# Deploy Log-relays op sharon.life

De testclient gebruikt twee kleine PHP-endpoints:

- `https://sharon.life/log/api/sync.php` voor back-up, uren, auto, gesprekken en andere samenwerkingen;
- `https://sharon.life/log/api/connections.php` voor wederzijds bevestigde persoonsverbindingen.

GitHub Pages kan geen PHP uitvoeren. Daarom moeten de bestanden uit `test/server/` via Strato/FileZilla naar de PHP-hosting worden gekopieerd.

## Doelpaden

Upload:

`test/server/sync.php`

naar:

`/log/api/sync.php`

En upload:

`test/server/connections.php`

naar:

`/log/api/connections.php`

op sharon.life.

Beide staan naast de bestaande:

`/log/api/publish.php`

## Rechten

Gebruik geen `777` als permanente instelling.

Aanbevolen:

- `sync.php`: `644`
- `connections.php`: `644`
- `/log/api`: `755`
- `/log/private`: alleen schrijfbaar voor de webserver/eigen account zoals al nodig voor `publish.php`

`sync.php` maakt zelf onder `/log/private/` de map `sync` aan met private submappen voor status en versleutelde payloads.

`connections.php` maakt zelf onder `/log/private/` de map `connections` aan. Daarin staat per ConnectionId alleen de verbindingsstatus, hashes van de twee toegangssleutels en de versleutelde verbindingspayload.

## Wat staat online

De client versleutelt inhoud vóór verzending.

Bij persoonlijke back-up en samenwerking bewaart `sync.php` daarom onder meer:

- willekeurige publieke alias;
- revisie/status (`active`, `offline`, `revoked`);
- hashes van toegangstokens;
- rechten per deelnemer;
- acceptatie-/afwijzingsstatus voor gedeelde uren;
- versleutelde payload.

Bij een persoonsverbinding bewaart `connections.php`:

- 12-teken `ConnectionId`;
- PersonId van beide deelnemers;
- hash van de toegangssleutel van beide kanten;
- status (`pending`, `connected`, `rejected`, `revoked`);
- versleutelde verbindingspayload zolang de verbinding niet is ingetrokken.

Een verbinding kan door beide kanten worden verbroken. Bij verbreken wordt de online payload verwijderd en de oude ConnectionId ingetrokken. Opnieuw verbinden maakt altijd een nieuwe ConnectionId.

## Eerste controle

Na upload hoort een GET zonder geldige 12-teken-ID bij beide endpoints een JSON-fout terug te geven in plaats van een 404 van de webserver.

Controleer dus afzonderlijk dat zowel `sync.php` als `connections.php` door Strato als PHP wordt uitgevoerd.

## Testvolgorde

1. Open Log TEST en controleer versie `0.39-test.3`.
2. Open Instellingen → Mijn Log & samenwerking.
3. Controleer dat een PersonId en VehicleId beschikbaar zijn.
4. Open Personen. Swipe **Mijn gegevens** en controleer dat **Delen** de eigen persoonskaart toont.
5. Maak op apparaat A een persoon B aan. Deze begint als voorlopige persoon.
6. Swipe B → **Verbinden**. Scan eerst B's persoonskaart als de echte PersonId nog niet bekend is.
7. Maak daarna het verbindingsverzoek. De QR voor het verzoek bevat uitsluitend de 12-teken ConnectionId.
8. Open op apparaat B persoon A → **Verbinden** → **Verbindingsverzoek scannen**, scan de ConnectionId en bevestig.
9. Controleer dat A na synchronisatie een groene status krijgt en dat beide kanten **Verbonden** tonen.
10. Start vanuit de verbinding een 1-op-1 chat en controleer dat het gesprek een aparte ConversationId/samenwerking krijgt.
11. Maak met minimaal twee bevestigde persoonsverbindingen een groepschat. Iedere deelnemer moet een eigen uitnodiging krijgen voor dezelfde ConversationId.
12. Verbreek de persoonsverbinding aan één kant. Controleer dat de contactkaart en historische registraties blijven bestaan maar de verbinding aan beide kanten als verbroken eindigt.
13. Kies **Opnieuw verbinden**. Controleer dat een nieuwe ConnectionId wordt gemaakt; de oude ConnectionId mag niet opnieuw actief worden.
14. Maak daarna een versleutelde persoonlijke back-up met een testwachtwoord en controleer herstel op een tweede apparaat.
15. Deel een tijdregistratie en laat de tweede persoon accepteren/afwijzen. Controleer dat de uren bij de eigenaar als geaccepteerd of afgewezen terugkomen.
16. Wijzig daarna de voorgelegde uren en publiceer opnieuw. Controleer dat de eerdere acceptatie opnieuw `pending` wordt.
17. Deel de auto met B en voeg eventueel C aan dezelfde autosamenwerking toe.
18. Activeer de gedeelde auto op B, registreer daar een nieuwe rit en publiceer de voertuigregistratie terug. Controleer op A dat dezelfde VehicleId wordt gebruikt maar B als bestuurder is vastgelegd.
19. Zet een gewone samenwerking tijdelijk offline en controleer dat de lokale samenwerking op beide apparaten blijft bestaan.
20. Beëindig als eigenaar een testsamenwerking en controleer dat deelnemers na hun eerstvolgende online controle geen toegang meer hebben tot de gedeelde inhoud in Log.

### Belangrijk bij meerdere deelnemers

Een **persoonsverbinding** bevestigt alleen dat twee Log-identiteiten elkaar wederzijds hebben bevestigd. Dat geeft niet automatisch rechten op gesprekken, auto's, uren of andere objecten.

Gesprekken zijn aparte samenwerkingen. Eén ConversationId kan meerdere deelnemers bevatten en iedere deelnemer krijgt een eigen toegangstoken. Daardoor kan een groepschat blijven bestaan als twee deelnemers hun persoonlijke 1-op-1 verbinding later verbreken; deelname aan het groepsgesprek is een aparte relatie.

Taken/uren worden bewust per persoon voorgelegd, zodat toegewezen minuten en acceptatie per persoon afzonderlijk blijven.

Een individuele deelnemer uit een bestaande versleutelde groepssamenwerking verwijderen is nog niet als gebruikersactie vrijgegeven: daarvoor moet ook de gedeelde inhoudssleutel worden geroteerd. De eigenaar kan de volledige samenwerking wel veilig beëindigen; daarbij wordt de online payload verwijderd en de samenwerking ingetrokken.

Live/productie hoeft voor deze test niet te worden gewijzigd.
