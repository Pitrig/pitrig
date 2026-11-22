# Interface glossary

The terms and style of the `uk`, `ko` and `pl` catalogs (ADR 0031). One English term keeps one
translation everywhere, inflected as the grammar needs; an English word with two meanings gets two
terms, each used consistently. A new term goes into this table in the change that introduces it.

| English | Українська | Polski | 한국어 |
| --- | --- | --- | --- |
| board (the ESP32 device) | плата | płytka | 보드 |
| dashboard | дашборд | dashboard | 대시보드 |
| widget | віджет | widżet | 위젯 |
| screen / page / slot | екран / сторінка / слот | ekran / strona / slot | 화면 / 페이지 / 슬롯 |
| layer / group | шар / група | warstwa / grupa | 레이어 / 그룹 |
| template | шаблон | szablon | 템플릿 |
| font / font family | шрифт / сімейство шрифтів | czcionka / rodzina czcionek | 글꼴 / 글꼴 패밀리 |
| face, weight (a font file) | накреслення | krój | 글꼴 파일 |
| image (picture, the Image widget) | зображення | obraz | 이미지 |
| firmware image | образ прошивки | obraz firmware | 펌웨어 이미지 |
| picture (LED picture) | малюнок | obrazek | 그림 |
| Shape widget / Lights widget | Фігура / Вогні | Kształt / Lampki | 도형 / 라이트 |
| canvas / box | полотно / прямокутник | płótno / obszar | 캔버스 / 박스 |
| trace (a graph line) | крива | przebieg | 트레이스 |
| telemetry / field / value | телеметрія / поле / значення | telemetria / pole / wartość | 텔레메트리 / 필드 / 값 |
| source / binding | джерело / прив’язка | źródło / powiązanie | 소스 / 바인딩 |
| caption | підпис | podpis | 캡션 |
| rule / condition / threshold | правило / умова / поріг | reguła / warunek / próg | 규칙 / 조건 / 임계값 |
| ramp / stop | колірна шкала / точка | skala kolorów / punkt | 색상 램프 / 지점 |
| lamp (one LED) | лампа | lampka | 램프 |
| LED strip (hardware) | світлодіодна стрічка | taśma LED | LED 스트립 |
| strip (the on-screen row of lamps) | стрічка | rząd lampek | 스트립 |
| matrix / effect / gate | матриця / ефект / умова ввімкнення | matryca / efekt / warunek włączenia | 매트릭스 / 효과 / 활성 조건 |
| pin / output | пін / вихід | pin / wyjście | 핀 / 출력 |
| shift light | індикатор перемикання передач | shift light | 시프트 라이트 |
| firmware / flash | прошивка / прошити | firmware / wgrać firmware | 펌웨어 / 플래시하다 |
| update / restart | оновити / перезапустити | zaktualizować / uruchomić ponownie | 업데이트 / 다시 시작 |
| safe mode | безпечний режим | tryb awaryjny | 안전 모드 |
| Save to board / Load from board | Зберегти на плату / Завантажити з плати | Zapisz na płytce / Wczytaj z płytki | 보드에 저장 / 보드에서 불러오기 |
| draft / configuration / document | чернетка / конфігурація / документ | wersja robocza / konfiguracja / dokument | 작업본 / 구성 / 문서 |
| library / plugin / bridge | бібліотека / плагін / міст | biblioteka / wtyczka / most | 라이브러리 / 플러그인 / 브리지 |
| apply / live apply | застосувати / застосування наживо | zastosować / zastosowanie na żywo | 적용 / 실시간 적용 |
| link / port / device | з’єднання / порт / пристрій | połączenie / port / urządzenie | 연결 / 포트 / 장치 |
| connect | під’єднати | połączyć | 연결 |
| upload / download | передати / завантажити | przesłać / pobrać | 업로드 / 다운로드 |
| Remove / Delete | Вилучити / Видалити | Usuń | 제거 / 삭제 |
| tap / tap zone | дотик / зона дотику | dotknięcie / strefa dotyku | 탭 / 탭 영역 |
| PC | комп’ютер | komputer | PC |
| invalid | недійсний | nieprawidłowy | 잘못된 |
| lap / gear | коло / передача | okrążenie / bieg | 랩 / 기어 |

## Style

- **Українська.** Buttons and commands in the infinitive («Зберегти», «Скасувати»); the user is «ви»;
  quotes «…»; apostrophe ’; page names in quotes and the nominative («на сторінці «Прошивка»»); never
  the letters ы, э, ъ, ё.
- **Polski.** Buttons and commands in the imperative („Zapisz”, „Anuluj”); impersonal messages, the
  second person singular when the user must act; quotes „…”; "firmware" is not inflected.
- **한국어.** Buttons and commands as short nouns ("저장", "취소"); sentences in 합니다체; quotes “…”.
- All: keep short labels short, at most a third longer than the English. A number in a message
  without `$plural` goes after a colon («Шарів: {count}») so no ending depends on it.

## Never translate

Product and brand names (Pitrig, SimHub, ESP32, LVGL, game and board names), abbreviations and units
(USB, LED, RGB, GPIO, JSON, RPM, ms, Hz, px, %, KB, MB), anything in backticks or starting with `@PR:`,
file names, keyboard keys and shortcuts, placeholders `{name}`, and the option names of the
configuration format (`json_values` in `configuration/configuration_schema.json`) where a sentence
names the option itself.
