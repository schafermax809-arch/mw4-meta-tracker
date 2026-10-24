# MW4 Intel · automatische Meta-Updates

Statische Website und tägliche GitHub-Actions-Prüfung für **Call of Duty: Modern Warfare 4 (2026), Multiplayer**. Der Auftrag „12. Automatische Meta-Updates“ ist hier als neues, eigenständiges Projekt umgesetzt. Die übrigen Funktionen des umfangreichen Website-Briefings sind nicht vollständig Teil dieses Projekts.

## Betrieb

### Waffenmenü und Gunsmith

Die Oberfläche ist als zusammenhängendes Ingame-Menü gestaltet: vertikale Waffenklassen auf Desktop, kompakte Auswahl auf Mobilgeräten, kantige Waffen-Kacheln, orange Auswahl und eine große Waffenansicht. Die sechs Gunsmith-Untermenüs sind **Aufsätze, Meta-Build, Camo-Build, Tarnungen, Herausforderungen und Tracker**. Tierlist, Grind Planner, Quellen, Changelog und Speicherverwaltung verwenden dieselbe Menüstruktur. Es gibt keine separate Dashboard-Oberfläche mehr.

Navigation erfolgt ohne Seitenneuladungen per URL-Hash, inklusive Zurück/Vorwärts im Browser. Alte Verweise auf `#weapons`, `#overview`, `#sources` und `#changelog` funktionieren weiterhin. Mit den Pfeiltasten wechselst du in der Waffenbibliothek die Auswahl, Enter öffnet den Gunsmith, F schaltet einen Favoriten, / öffnet die Suche und Escape führt zurück. Im Gunsmith wechseln Q/E die Waffe und 1–6 das Untermenü; die Tab-Leiste unterstützt auch Pfeiltasten, Pos1 und Ende. Eingabefelder und native Dialoge behalten ihre normale Tastaturbedienung. Animationen beachten `prefers-reduced-motion`.

Der Camo-Speicherschlüssel und das Import-/Exportformat bleiben unverändert. Favoriten liegen separat unter `mw4-intel:preferences:v1`, eigene Builds unter `mw4-intel:custom-builds:v1`. Die neue UI migriert oder überschreibt bestehende Zähler nicht. Der Planner berücksichtigt ausschließlich bestätigte, offene Ziele und deren Voraussetzungen. Er behauptet keinen vollständigen Mastery-Fortschritt, wenn Camo-Daten fehlen.

Eigene Builds können benannt, gespeichert, bearbeitet, gelöscht, als JSON exportiert/importiert und über einen Link geteilt werden. Ein geteilter Build wird zunächst nur als Entwurf geöffnet; der Link enthält keine Camo-Zähler. Beim Laden älterer Konfigurationen werden entfernte oder inkompatible Aufsätze markiert, ohne die gespeicherte Konfiguration zu löschen. Der Vergleich zeigt Aufsatzunterschiede; fehlende Leistungsdaten bleiben unbekannt.

**Grenzen der vorhandenen Spieldaten:** Es sind weiterhin keine verifizierten Aufsatznamen oder Meta-Builds hinterlegt. Die Slot-Typen wurden separat aus dem offiziellen Waffenartikel übernommen (`public/data/presentation.json`). Nicht belegte Slot-Limits bleiben `null`; deshalb darf der Editor keine angeblich gültigen Kombinationen erfinden. Neue Aufsätze werden erst nach Bestätigung von Limit, Kompatibilität und Sonderregeln auswählbar. Ein Basis-Build ohne Aufsätze kann gespeichert werden. Bei einem neuen Patch werden Slot-Regeln, ältere Builds und Werte wieder prüfbedürftig.

Die Statistikfunktion nutzt ausschließlich verifizierte Messwerte einer **exakten Aufsatzkombination für den aktuellen Patch**. Sie addiert keine geratenen Prozentwerte. Vorgesehene Daten: `presentation.weapons[weaponId].statistics = { patchRevision, sourceUrls, snapshots: [{ attachments, values: { damage: { value, unit, scaleMax? }, ... } }] }`. `scaleMax` darf nur für eine ebenfalls belegte Skala angegeben werden. Ohne passenden Snapshot bleibt die Anzeige „Nicht verifiziert“.

Three.js, GLTFLoader und OrbitControls werden lokal gebündelt und erst bei einer registrierten, lizenzierten GLB-/GLTF-Datei geladen. Ein Asset benötigt `model`, `license` und `sourceUrl` im zugehörigen `asset`-Eintrag. Mit einem solchen Asset aktiviert die UI Drehung, Zoom, Verschieben, Touch-Gesten und Kamera-Reset. Aktuell sind **keine verifizierten MW4-3D-Modelle oder modularen Aufsatzmodelle vorhanden**. Es wird daher keine 3D-Inspektion oder visuelle Aufsatzänderung vorgetäuscht. Stattdessen gibt es ehrlich bezeichnete 2D-Fotos für drei reale Waffentypen. Für die übrigen Waffen und Camos bleibt die Vorschau als fehlend markiert. Lizenzdetails: `public/ASSET-LICENSES.md` sowie Intel → Bildnachweise.

Die Tests unter `test/gunsmith.test.mjs` prüfen Fortschrittsübernahme, Voraussetzungen, Filter, Planner, getrennte Speicherbereiche, Aufsatzlimits, Kompatibilität, Slot-Blockierungen, veraltete Regeln, gespeicherte Builds, Unicode-Links und exakte Statistik-Snapshots. Die bisherigen Update-Tests laufen unverändert weiter.

- Website: https://schafermax809-arch.github.io/mw4-meta-tracker/
- Läufe und Fehlerberichte: https://github.com/schafermax809-arch/mw4-meta-tracker/actions
- Vorgeschlagene Updates: https://github.com/schafermax809-arch/mw4-meta-tracker/pulls
- Täglich **05:17 UTC**, also **06:17 Uhr im deutschen Winter / 07:17 Uhr im Sommer**. GitHub kann geplante Läufe verzögern. Manuelles Starten: Actions → Daily verified meta review → Run workflow.
- Das öffentliche Repository und GitHub Pages benötigen keine kostenpflichtige Daten-API. GitHub-Nutzungsgrenzen gelten weiterhin. In öffentlichen Repositories kann GitHub geplante Workflows nach 60 Tagen ohne Repository-Aktivität deaktivieren; dann im Actions-Tab wieder aktivieren.

## Was tatsächlich automatisch passiert

1. Offizielle Patchnotes- und Blog-Indexseiten werden einmal je Lauf abgerufen. Bereits bekannte Kernartikel werden ebenfalls geprüft. Discovery beginnt mit dem Launchmonat Oktober 2026; frühere Beta- und Mobile-Artikel werden ausgeschlossen.
2. `robots.txt`, HTTPS und die erlaubten Ursprünge werden geprüft. Timeouts, begrenzte Wiederholungen, eine maximale Artikelzahl und ein Größenlimit verhindern unkontrollierte Abrufe. Umleitungen, fehlende Artikelinhalte, unlesbare Quellen und geänderte Index-Layouts brechen den Lauf ab. Es gibt keine Anmeldung und keine undokumentierte private API.
3. Ein SHA-256 über den redaktionellen Artikelinhalt erkennt auch Änderungen unter derselben URL. Navigation, Skripte und Seitenfuß gehören nicht zum Fingerabdruck.
4. Explizite Waffenklassen mit unmittelbar folgenden Waffenlisten ergeben **Vorschläge für neue Waffen**. Bestehende Einträge werden dabei niemals durch Textinterpretation überschrieben. Neue benannte Camo-Abschnitte und geänderte Anforderungen werden mit separaten Fingerabdrücken im Prüfbericht als `camoChanges` ausgewiesen. Das sind Prüfhinweise, noch keine automatisch bestätigten Anforderungen. Konflikte bei vorhandenen Waffen stehen unter `catalogConflicts`; konkrete Ziele und Tier-Einstufungen werden nicht geraten.
5. Nur wenn Quellenrevisionen oder geprüfte Operationen abweichen, entstehen validierte Kandidaten unter `work/candidate/`. Der tägliche Prüflauf schreibt zunächst ausschließlich in diesen temporären Bereich.
6. Nach Tests und Validierung erzeugt der Workflow einen Commit auf `automation/meta-update` und einen Pull Request. **Erst dein Merge gibt den vorgeschlagenen Datenstand frei.** Es gibt kein Auto-Merge. Ein identischer offener Vorschlag erzeugt keinen weiteren Commit. Weitere Funde aktualisieren einen ausschließlich vom Bot bearbeiteten PR ohne Umschreiben seiner Historie. Ein offener PR mit manuellen Änderungen wird bewahrt; neuere Funde stehen dann im Artefakt des Prüflaufs. Bitte den offenen PR zeitnah bearbeiten.
7. Ein Merge nach `main` startet die erneute Validierung und veröffentlicht ausschließlich `public/` auf GitHub Pages. Update-Skript, Konfiguration, Tests und Abhängigkeiten landen nicht auf der Website.

**Bewusste Grenze:** Eine frei dokumentierte offizielle API für MW4-Meta-Ranglisten oder optimale Aufsätze wurde bei der Einrichtung nicht gefunden. Ein Balance-Patch beweist keine Tier-Einstufung. Deshalb erfolgt die Übernahme grundsätzlich über einen Review-PR. Der Startkatalog enthält 33 offiziell belegte Waffen; Meta-Tiers und Builds sind zunächst unbekannt. Für Han 86 sind die acht konkret dokumentierten Military-Camo-Levelziele erfasst. Weitere konkrete Camo-Ziele bleiben bis zur Prüfung unbekannt. Das Projekt behauptet keinen vollständigen, aktuell verifizierten Meta-Datensatz.

## Einmalige GitHub-Einstellungen

Falls diese Einstellungen noch nicht aktiviert sind:

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** aktivieren. Der Workflow nutzt ausschließlich das automatische `GITHUB_TOKEN` mit expliziten Repository-Berechtigungen; es wird kein persönliches Token benötigt. Der Bot genehmigt und merged keine PRs.
3. Die beiden Workflows müssen auf dem Standardbranch `main` liegen. „Daily verified meta review“ einmal manuell ausführen.
4. Von `GITHUB_TOKEN` erzeugte PRs können eine gesonderte Freigabe ihrer PR-Workflows benötigen. Die Tests werden bereits im täglichen Workflow ausgeführt, bevor ein Commit entsteht; die Pages-Pipeline prüft beim Merge erneut.

Optional den Branchschutz für `main` mit manueller PR-Freigabe und erfolgreichen Checks konfigurieren. Das ist keine Voraussetzung für den Update-Lauf, verhindert aber versehentliche Direktänderungen durch andere Maintainer.

## Quellen und Nutzungsregeln

Konfiguration: [`config/sources.json`](config/sources.json). Bei der Einrichtung am 24.10.2026 wurden die [öffentlichen Patchnotes](https://www.callofduty.com/patchnotes), der [offizielle Waffenartikel](https://www.callofduty.com/blog/2026/10/call-of-duty-modern-warfare-4-launch-multiplayer-operators-weapons-equipment-create-a-class), der [offizielle Fortschrittsartikel](https://www.callofduty.com/blog/2026/10/call-of-duty-modern-warfare-4-ready-for-launch-progression-prestige) und die [Nutzungsbedingungen](https://www.activision.com/legal/terms-of-use) geprüft. Die Quelle ist als redaktionelle Informationsquelle eingebunden, nicht als lizenzierte Daten-API. `robots.txt` erlaubte zum Einrichtungszeitpunkt öffentliche Abrufe und wird bei jedem Lauf erneut ausgewertet. Eine robots-Erlaubnis ersetzt keine Lizenz.

Gespeichert werden sachliche Waffenbezeichnungen, konkret geprüfte Anforderungen, Links, Titel und Hashes. Keine vollständigen Artikel, fremden Bilder oder Videos. Die niedrige Abrufrate, Quellen-Whitelist und Fehlerbehandlung sind bewusst konservativ. Vor zusätzlichen Quellen deren Nutzungsbedingungen und Weiterverwendungsrechte prüfen, die Whitelist ausdrücklich erweitern und einen eigenen Parser samt Tests hinzufügen. Private Spielerdaten-Endpunkte und kostenpflichtige Dienste sind nicht Bestandteil dieses Systems. Es werden keine Drittanbieter-Websites ohne geprüfte Erlaubnis gescrapt.

## Datenmodell und Freigabe eigener Meta-Builds

`public/data/meta.json` ist die einzige veröffentlichte Dateneinheit. Sie enthält Waffen, Aufsätze, Camo-Definitionen, vollständige Änderungsbelege sowie Metadaten. Der strikte Validator verwirft unbekannte Felder einschließlich persönlicher Fortschrittsfelder, doppelte IDs, ungültige Ziele, zyklische Camo-Voraussetzungen, unbekannte Aufsätze und inkompatible Slot-/Waffenzuordnungen.

Ein Tier besitzt eine `tierRevision`, ein Build eine `patchRevision`. Bei einem neuen Patch bleiben alte Empfehlungen erhalten, werden in der Website aber als erneut prüfbedürftig dargestellt und nicht als aktuelle Meta gezählt. Die Revision muss nach inhaltlicher Prüfung gezielt aktualisiert werden. Modusangaben verhindern, dass DMZ- oder Warzone-Empfehlungen versehentlich als Multiplayer-Builds erscheinen.

Für manuelle geprüfte Änderungen auf einem Review-Branch:

1. `reviews/approved.json` anlegen. Das Format ist `{ "baseStateHash": "SHA256 des aktuellen kanonischen Datensatzes", "documents": [...], "operations": [...] }`.
2. Den Basishash ausgeben: `node --input-type=module -e "import {readJson} from './scripts/lib/io.mjs'; import {hash} from './scripts/lib/model.mjs'; console.log(hash(await readJson('public/data/meta.json')))"`.
3. `documents` enthält die geprüften Dokumente mit `url`, `hash`, `title`, `publishedAt` (`YYYY-MM-DD` oder `null`), `kind` (`patch` oder `guide`). Verwende die echten Dokument-Fingerabdrücke aus `meta.json` bzw. `reviews/pending.json`.
4. Eine Operation hat `{ "type": "upsert-weapon", "value": <vollständiger Waffeneintrag> }` oder `upsert-attachment`. Quellen-URLs des Eintrags müssen in `documents` vorkommen. Waffeneinträge enthalten `id`, `name`, `weaponClass`, `tier`, `tierRevision`, `builds`, `camos`, `sourceUrls`. Builds enthalten `id`, `mode`, `kind`, `attachments`, `notes`, `sourceUrls`, `patchRevision`; jede Aufsatzreferenz enthält `slot` und `attachmentId`. Camos enthalten `id`, `name`, `mode`, `requirement`, `target`, `unit`, `dependsOn`, `sourceUrls`.
5. `npm run apply-review -- --input reviews/approved.json`, dann `npm test && npm run validate && npm run build`. Diff prüfen, committen und per PR freigeben.

Ein vollständiges synthetisches Beispiel mit Aufsatz- und Camo-Zuordnungen steht im Test `test/update.test.mjs`; diese Testdaten werden niemals veröffentlicht. Operationen sind ausschließlich ein Werkzeug für Maintainer. Sie werden nicht von einer Website oder einer ungeprüften Fremd-API übernommen. Es gibt keine Löschoperation; stabile Waffen- und Camo-IDs bleiben erhalten.

## Zeitstempel, Patchstand und Verlauf

- `lastSuccessfulUpdate`: Zeitpunkt des erfolgreich vorbereiteten, nach Merge übernommenen Datenstands. Ein unveränderter oder fehlgeschlagener Prüflauf verändert ihn nicht. Der Prüfzeitpunkt jedes Laufs steht separat im Actions-Artefakt `meta-update-report`.
- `patchVersion`: Titel und Datum der berücksichtigten offiziellen Patchnotes. Wenn keine offizielle nummerierte Spielversion genannt wird, erfindet das System keine Buildnummer.
- `patchRevision`: SHA-256 des redaktionellen Quellenstands. Auch ein Hotfix unter derselben URL wird dadurch erkannt.
- `lastChangedAt` / `lastChangedWeaponIds`: letztes tatsächliches Waffenupdate. Reine Quellenprüfungen ersetzen diese Liste nicht.
- `changelog`: alle übernommenen Revisionen; pro geänderter Waffe Felder und vollständiger Vorher-/Nachher-Eintrag. Der erste Eintrag ist ausdrücklich als Ersteinrichtung erkennbar.

## Camo-Fortschritt und Ausfallsicherheit

Persönlicher Fortschritt liegt ausschließlich unter `localStorage['mw4-intel:camo-progress:v1']`. Die Update-Skripte haben keinen Browserzugriff und veröffentlichen keine persönlichen Werte. Änderungen an Herausforderungen verändern gespeicherte Zähler niemals; auch IDs, die nicht mehr angezeigt werden, bleiben im Export erhalten. Die Anzeige begrenzt lediglich einen Balken auf 100 %. Fortschritt lässt sich im Waffendialog exportieren und nach ausdrücklicher Bestätigung importieren. Ungültige Imports und Speicherfehler überschreiben keine bisherigen Werte. Bei blockiertem oder beschädigtem Speicher wird nicht automatisch neu initialisiert.

Alle Kandidaten werden vollständig im Speicher geprüft und erst dann atomar als eine JSON-Datei in einen temporären Pfad geschrieben. Netzwerkfehler und Datenfehler beenden den Lauf mit Fehlerstatus und behalten den bisherigen Stand. Commit und Push erfolgen erst nach Validierung, Tests und statischem Build. Parallel laufende Updates werden durch eine Concurrency-Gruppe serialisiert. Ein fehlgeschlagenes Deployment lässt die letzte funktionierende Pages-Version bestehen. Frühere veröffentlichte Daten sind zusätzlich über Git und den Changelog wiederherstellbar.

Rollback: einen eigenen Branch vom aktuellen `main` erstellen, den fehlerhaften Daten-Commit mit `git revert <sha>` rückgängig machen und als PR mergen. Dabei bleiben spätere Änderungen nachvollziehbar. Das ändert keinen lokalen Camo-Fortschritt.

## Lokal entwickeln

Node.js 24 oder neuer:

```sh
npm ci --ignore-scripts
npm test
npm run validate
npm run update       # prüft Quellen; schreibt ausschließlich work/, keine Veröffentlichung
npm run build        # statische Website in dist/
npm start            # http://127.0.0.1:4173
```

Die Website arbeitet mit relativen URLs, funktioniert daher auch unter dem GitHub-Pages-Unterpfad. Keine Serverfunktionen oder Laufzeit-Secrets. Google Fonts ist optional; bei fehlender Verbindung greifen lokale Systemschriften. Nur `dist/` wird veröffentlicht.

## Referenzen zur GitHub-Konfiguration

- [Geplante Workflows und deren Grenzen](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Workflows mit GITHUB_TOKEN auslösen](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [GitHub Pages mit eigenem Workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages-to-deploy-your-site)

Alle verwendeten Actions sind auf überprüfte Commit-SHAs festgelegt; Updates daran bewusst prüfen.
