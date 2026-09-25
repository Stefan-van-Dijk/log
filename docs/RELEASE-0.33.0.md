# Log 0.33.0 — 25 september 2026

Promotie van test 0.31.10-test.120. De runtime is functioneel gelijk, met productie-opslagsleutels, versielabel en cache. De bestaande live manifest-identiteit blijft behouden. Testdata wordt niet overgezet.

Bevat de eenknops-omrijpuntregistratie met wachttijd, uniforme swipe-acties, kaarten en scanner, herkenning van bestaande codes en Log-QR met gegevensimport en bevestigde taak-/ritstarters.

Ritten, GPS-database, tijdregistraties, menu-instellingen, identiteiten en archief behouden hun bestaande live sleutels. Nieuwe kaartgegevens zijn optioneel; bestaande gegevens hoeven niet te worden gemigreerd. De live service worker negeert testpaden en verwijdert uitsluitend oude live shellcaches.

Gerichte controles: productieversies van kaart/scanner-, Log-QR-, scanactie- en swiperoutines; versielabel; behoud van opslagkeys, runtimebestanden en service-worker-isolatie. Fysieke iPhone-controle blijft nodig.
