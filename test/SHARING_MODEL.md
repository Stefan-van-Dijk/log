# Log — model voor gedeelde gegevens

## Kernregel

Een gedeelde identifier beschrijft de identiteit van een gepubliceerde bron. Het ontvangen van die identifier geeft niet automatisch het recht om dezelfde bron te overschrijven.

## Rollen

### Bronbeheerder
- Publiceert een object voor het eerst.
- Mag dezelfde identifier opnieuw publiceren en daarmee een nieuwe revisie van die bron maken.
- Ontvangers zien die revisie als update van dezelfde bron.

### Ontvanger
- Slaat het hoofobject lokaal op met dezelfde identifier, zodat herkomst en updates herkenbaar blijven.
- Mag lokaal wijzigingen maken.
- Kiest bij een bronupdate bewust tussen de lokale versie en de bronversie.
- Krijgt door ontvangst niet automatisch publicatierecht op de oorspronkelijke identifier.

### Door-delen
- Een ontvanger mag een ontvangen object verder delen.
- Log publiceert dat als afgeleide bron met een nieuwe identifier.
- De publicatie bewaart `originId` en `parentId`, zodat de keten herleidbaar blijft.
- Een volgende ontvanger volgt de afgeleide identifier; de oorspronkelijke bron blijft onafhankelijk bestaan.

## Updateconflict

Bij een inhoudelijk verschil toont Log:
- het onderdeel en veld dat verschilt;
- **Mijn versie**;
- **Bronversie**;
- keuze **Bronversie gebruiken**;
- keuze **Mijn versie behouden**.

Een controle op updates wijzigt niets automatisch.

## Publicatierechten

De testclient voorkomt dat een ontvangen bron opnieuw onder de oorspronkelijke identifier wordt gepubliceerd. Een ontvangen object dat opnieuw wordt gedeeld krijgt een nieuwe afgeleide identifier.

Dit is nog client-side bescherming. Voor harde autorisatie moet de server per identifier eigenaarschap afdwingen, bijvoorbeeld met een afzonderlijk write-token of een eigenaarssleutel per bron. Een algemene server-publicatiesleutel is daarvoor niet voldoende.

## Gewenst vervolg

Een mogelijke vervolgstap is een wijzigingsvoorstel: een ontvanger kan zijn aanpassingen terugsturen naar de bronbeheerder zonder de bron zelf te overschrijven. De bronbeheerder kan verschillen bekijken en het voorstel geheel of gedeeltelijk accepteren.