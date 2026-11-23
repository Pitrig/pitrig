# Interface glossary

The terms and style of the `uk`, `ko`, `pl`, `de` and `es` catalogs (ADR 0031). One English term
keeps one translation everywhere, inflected as the grammar needs; an English word with two meanings
gets two terms, each used consistently. A new term goes into this table in the change that
introduces it.

| English | Українська | Polski | 한국어 | Deutsch | Español |
| --- | --- | --- | --- | --- | --- |
| board (the ESP32 device) | плата | płytka | 보드 | Board (das Board, die Boards) | placa |
| dashboard | дашборд | dashboard | 대시보드 | Dashboard (das) | dashboard (el dashboard, los dashboards) |
| widget | віджет | widżet | 위젯 | Widget (das) | widget (el) |
| screen / page / slot | екран / сторінка / слот | ekran / strona / slot | 화면 / 페이지 / 슬롯 | Bildschirm / Seite / Slot | pantalla / página / slot |
| layer / group | шар / група | warstwa / grupa | 레이어 / 그룹 | Ebene / Gruppe | capa / grupo |
| template | шаблон | szablon | 템플릿 | Vorlage | plantilla |
| font / font family | шрифт / сімейство шрифтів | czcionka / rodzina czcionek | 글꼴 / 글꼴 패밀리 | Schriftart / Schriftfamilie | fuente / familia de fuentes |
| face, weight (a font file) | накреслення | krój | 글꼴 파일 | Schnitt | variante |
| image (picture, the Image widget) | зображення | obraz | 이미지 | Bild | imagen |
| firmware image | образ прошивки | obraz firmware | 펌웨어 이미지 | Firmware-Image | imagen de firmware |
| picture (LED picture) | малюнок | obrazek | 그림 | Motiv | dibujo |
| Shape widget / Lights widget | Фігура / Вогні | Kształt / Lampki | 도형 / 라이트 | Form / Leuchten | Forma / Luces |
| canvas / box | полотно / прямокутник | płótno / obszar | 캔버스 / 박스 | Arbeitsfläche / Rahmen | lienzo / recuadro |
| trace (a graph line) | крива | przebieg | 트레이스 | Kurve | curva |
| telemetry / field / value | телеметрія / поле / значення | telemetria / pole / wartość | 텔레메트리 / 필드 / 값 | Telemetrie / Feld / Wert | telemetría / campo / valor |
| source / binding | джерело / прив’язка | źródło / powiązanie | 소스 / 바인딩 | Quelle / Verknüpfung | origen / vínculo |
| caption | підпис | podpis | 캡션 | Beschriftung | rótulo |
| rule / condition / threshold | правило / умова / поріг | reguła / warunek / próg | 규칙 / 조건 / 임계값 | Regel / Bedingung / Schwellenwert | regla / condición / umbral |
| ramp / stop | колірна шкала / точка | skala kolorów / punkt | 색상 램프 / 지점 | Farbskala / Punkt | escala de colores / punto |
| lamp (one LED) | лампа | lampka | 램프 | Leuchte | luz |
| LED strip (hardware) | світлодіодна стрічка | taśma LED | LED 스트립 | LED-Streifen | tira LED |
| strip (the on-screen row of lamps) | стрічка | rząd lampek | 스트립 | Leuchtenreihe | fila de luces |
| matrix / effect / gate | матриця / ефект / умова ввімкнення | matryca / efekt / warunek włączenia | 매트릭스 / 효과 / 활성 조건 | Matrix / Effekt / Einschaltbedingung | matriz / efecto / condición de activación |
| pin / output | пін / вихід | pin / wyjście | 핀 / 출력 | Pin / Ausgang | pin / salida |
| shift light | індикатор перемикання передач | shift light | 시프트 라이트 | Shift-Light | shift light |
| firmware / flash | прошивка / прошити | firmware / wgrać firmware | 펌웨어 / 플래시하다 | Firmware / flashen | firmware / flashear |
| install mode / connector | режим встановлення / роз’єм | tryb instalacji / złącze | 설치 모드 / 커넥터 | Installationsmodus / Anschluss | modo de instalación / conector |
| update / restart | оновити / перезапустити | zaktualizować / uruchomić ponownie | 업데이트 / 다시 시작 | aktualisieren / neu starten | actualizar / reiniciar |
| safe mode | безпечний режим | tryb awaryjny | 안전 모드 | abgesicherter Modus | modo seguro |
| Save to board / Load from board | Зберегти на плату / Завантажити з плати | Zapisz na płytce / Wczytaj z płytki | 보드에 저장 / 보드에서 불러오기 | Auf Board speichern / Vom Board laden | Guardar en la placa / Cargar desde la placa |
| draft / configuration / document | чернетка / конфігурація / документ | wersja robocza / konfiguracja / dokument | 작업본 / 구성 / 문서 | Entwurf / Konfiguration / Dokument | borrador / configuración / documento |
| library / plugin / bridge | бібліотека / плагін / міст | biblioteka / wtyczka / most | 라이브러리 / 플러그인 / 브리지 | Bibliothek / Plugin / Brücke | biblioteca / plugin / puente |
| apply / live apply | застосувати / застосування наживо | zastosować / zastosowanie na żywo | 적용 / 실시간 적용 | anwenden / Live-Anwendung | aplicar / aplicación en vivo |
| link / port / device | з’єднання / порт / пристрій | połączenie / port / urządzenie | 연결 / 포트 / 장치 | Verbindung / Port / Gerät | conexión / puerto / dispositivo |
| connect | під’єднати | połączyć | 연결 | verbinden | conectar |
| upload / download | передати / завантажити | przesłać / pobrać | 업로드 / 다운로드 | übertragen / herunterladen | enviar / descargar |
| Remove / Delete | Вилучити / Видалити | Usuń | 제거 / 삭제 | Entfernen / Löschen | Quitar / Eliminar |
| tap / tap zone | дотик / зона дотику | dotknięcie / strefa dotyku | 탭 / 탭 영역 | Tippen / Tippbereich | toque / zona táctil |
| PC | комп’ютер | komputer | PC | PC | PC |
| invalid | недійсний | nieprawidłowy | 잘못된 | ungültig | no válido |
| lap / gear | коло / передача | okrążenie / bieg | 랩 / 기어 | Runde / Gang | vuelta / marcha |

## Style

- **Українська.** Buttons and commands in the infinitive («Зберегти», «Скасувати»); the user is «ви»;
  quotes «…»; apostrophe ’; page names in quotes and the nominative («на сторінці «Прошивка»»); never
  the letters ы, э, ъ, ё.
- **Polski.** Buttons and commands in the imperative („Zapisz”, „Anuluj”); impersonal messages, the
  second person singular when the user must act; quotes „…”; "firmware" is not inflected.
- **한국어.** Buttons and commands as short nouns ("저장", "취소"); sentences in 합니다체; quotes “…”.
- **Deutsch.** Standard German as written in Germany, with ß; buttons and commands in the infinitive
  („Speichern“, „Abbrechen“); the user is „Sie“; quotes „…“; an English word or an abbreviation in a
  compound takes a hyphen (LED-Streifen, Firmware-Update); das Board, das Dashboard, das Widget.
- **Español.** Neutral Spanish for Spain and Latin America; buttons and commands in the infinitive
  («Guardar», «Cancelar»); the user is «tú», never «vosotros» or «vos»; quotes «…»; always the
  opening ¿ and ¡; «fuente» is only a font and a data source is «origen»; words that differ by
  region are avoided («PC», «archivo», «teléfono»).
- All: keep short labels short, at most a third longer than the English. A number in a message
  without `$plural` goes after a colon («Шарів: {count}») so no ending depends on it.

## Never translate

Product and brand names (Pitrig, SimHub, ESP32, LVGL, game and board names), abbreviations and units
(USB, LED, RGB, GPIO, JSON, RPM, ms, Hz, px, %, KB, MB), anything in backticks or starting with `@PR:`,
file names, keyboard keys and shortcuts, placeholders `{name}`, and the option names of the
configuration format (`json_values` in `configuration/configuration_schema.json`) where a sentence
names the option itself.
