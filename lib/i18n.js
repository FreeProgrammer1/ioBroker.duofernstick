'use strict';
/**
 * Übersetzungen der Objektnamen (common.name) in alle von ioBroker unterstützten Sprachen.
 *
 * main.js erzeugt Namen weiterhin als { en, de }. localizeName() ergänzt daraus beim Anlegen
 * der Objekte die übrigen Sprachen. Unbekannte Namen werden als einfacher String gespeichert,
 * was ioBroker ausdrücklich erlaubt.
 */

const LANGUAGES = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

// Reihenfolge je Zeile: en, de, ru, pt, nl, fr, it, es, pl, uk, zh-cn
const TABLE = [
    // --- Kanäle -----------------------------------------------------------------------------
    ['Information', 'Information', 'Информация', 'Informação', 'Informatie', 'Informations', 'Informazioni', 'Información', 'Informacje', 'Інформація', '信息'],
    ['Status', 'Status', 'Статус', 'Estado', 'Status', 'État', 'Stato', 'Estado', 'Status', 'Статус', '状态'],
    ['Command queue', 'Befehlswarteschlange', 'Очередь команд', 'Fila de comandos', 'Opdrachtwachtrij', 'File de commandes', 'Coda comandi', 'Cola de comandos', 'Kolejka poleceń', 'Черга команд', '命令队列'],
    ['Pairing', 'Pairing', 'Сопряжение', 'Emparelhamento', 'Koppelen', 'Appairage', 'Associazione', 'Emparejamiento', 'Parowanie', 'Сполучення', '配对'],
    ['Commands', 'Befehle', 'Команды', 'Comandos', 'Opdrachten', 'Commandes', 'Comandi', 'Comandos', 'Polecenia', 'Команди', '命令'],
    ['Devices', 'Geräte', 'Устройства', 'Dispositivos', 'Apparaten', 'Appareils', 'Dispositivi', 'Dispositivos', 'Urządzenia', 'Пристрої', '设备'],
    ['Control', 'Steuerung', 'Управление', 'Controlo', 'Bediening', 'Commande', 'Comando', 'Control', 'Sterowanie', 'Керування', '控制'],

    // --- Adapter-Infos ----------------------------------------------------------------------
    ['Connection', 'Verbindung', 'Соединение', 'Ligação', 'Verbinding', 'Connexion', 'Connessione', 'Conexión', 'Połączenie', "З'єднання", '连接'],
    ['Last received raw telegram', 'Letztes empfangenes Rohtelegramm', 'Последняя принятая необработанная телеграмма', 'Último telegrama bruto recebido', 'Laatst ontvangen ruw telegram', 'Dernier télégramme brut reçu', 'Ultimo telegramma grezzo ricevuto', 'Último telegrama sin procesar recibido', 'Ostatni odebrany surowy telegram', 'Остання отримана сира телеграма', '最后接收的原始报文'],
    ['Configured radio code / DongleSerial', 'Konfigurierter Funkcode / DongleSerial', 'Настроенный радиокод / DongleSerial', 'Código de rádio configurado / DongleSerial', 'Ingestelde radiocode / DongleSerial', 'Code radio configuré / DongleSerial', 'Codice radio configurato / DongleSerial', 'Código de radio configurado / DongleSerial', 'Skonfigurowany kod radiowy / DongleSerial', 'Налаштований радіокод / DongleSerial', '已配置的无线代码 / DongleSerial'],
    ['Last transmitted raw telegram', 'Letztes gesendetes Rohtelegramm', 'Последняя отправленная необработанная телеграмма', 'Último telegrama bruto enviado', 'Laatst verzonden ruw telegram', 'Dernier télégramme brut envoyé', 'Ultimo telegramma grezzo inviato', 'Último telegrama sin procesar enviado', 'Ostatni wysłany surowy telegram', 'Остання надіслана сира телеграма', '最后发送的原始报文'],
    ['Last error', 'Letzter Fehler', 'Последняя ошибка', 'Último erro', 'Laatste fout', 'Dernière erreur', 'Ultimo errore', 'Último error', 'Ostatni błąd', 'Остання помилка', '最后错误'],
    ['Last parsed telegram', 'Letztes geparstes Telegramm', 'Последняя разобранная телеграмма', 'Último telegrama analisado', 'Laatst geparseerd telegram', 'Dernier télégramme analysé', 'Ultimo telegramma analizzato', 'Último telegrama analizado', 'Ostatni przeanalizowany telegram', 'Остання розібрана телеграма', '最后解析的报文'],
    ['Last status decode diagnostics', 'Letzte Status-Dekodierung Diagnose', 'Диагностика последнего декодирования статуса', 'Diagnóstico da última descodificação de estado', 'Diagnose laatste statusdecodering', 'Diagnostic du dernier décodage d’état', 'Diagnostica ultima decodifica stato', 'Diagnóstico de la última decodificación de estado', 'Diagnostyka ostatniego dekodowania statusu', 'Діагностика останнього декодування статусу', '最后状态解码诊断'],
    ['Last detected device code', 'Letzter erkannter Gerätecode', 'Последний обнаруженный код устройства', 'Último código de dispositivo detetado', 'Laatst gedetecteerde apparaatcode', 'Dernier code d’appareil détecté', 'Ultimo codice dispositivo rilevato', 'Último código de dispositivo detectado', 'Ostatni wykryty kod urządzenia', 'Останній виявлений код пристрою', '最后检测到的设备代码'],
    ['Known device count', 'Anzahl bekannter Geräte', 'Количество известных устройств', 'Número de dispositivos conhecidos', 'Aantal bekende apparaten', 'Nombre d’appareils connus', 'Numero di dispositivi noti', 'Número de dispositivos conocidos', 'Liczba znanych urządzeń', 'Кількість відомих пристроїв', '已知设备数量'],
    ['Received telegrams without detected device code', 'Empfangene Telegramme ohne erkannten Gerätecode', 'Принятые телеграммы без кода устройства', 'Telegramas recebidos sem código de dispositivo', 'Ontvangen telegrammen zonder apparaatcode', 'Télégrammes reçus sans code d’appareil', 'Telegrammi ricevuti senza codice dispositivo', 'Telegramas recibidos sin código de dispositivo', 'Odebrane telegramy bez kodu urządzenia', 'Отримані телеграми без коду пристрою', '未识别设备代码的接收报文'],
    ['Retained readings count', 'Beibehaltene Werte Zähler', 'Счётчик сохранённых значений', 'Contador de valores mantidos', 'Teller behouden waarden', 'Compteur de valeurs conservées', 'Contatore valori mantenuti', 'Contador de valores conservados', 'Licznik zachowanych wartości', 'Лічильник збережених значень', '保留值计数'],
    ['Last retained reading', 'Letzter beibehaltener Wert', 'Последнее сохранённое значение', 'Último valor mantido', 'Laatst behouden waarde', 'Dernière valeur conservée', 'Ultimo valore mantenuto', 'Último valor conservado', 'Ostatnia zachowana wartość', 'Останнє збережене значення', '最后保留值'],
    ['Cleaned obsolete device states count', 'Bereinigte veraltete Gerätewerte Zähler', 'Счётчик удалённых устаревших состояний', 'Contador de estados obsoletos removidos', 'Teller opgeschoonde verouderde states', 'Compteur d’états obsolètes nettoyés', 'Contatore stati obsoleti rimossi', 'Contador de estados obsoletos eliminados', 'Licznik usuniętych przestarzałych stanów', 'Лічильник очищених застарілих станів', '已清理的过时状态计数'],
    ['Last device state cleanup', 'Letzte Gerätewerte-Bereinigung', 'Последняя очистка состояний устройств', 'Última limpeza de estados', 'Laatste opschoning apparaatstates', 'Dernier nettoyage des états', 'Ultima pulizia stati dispositivo', 'Última limpieza de estados', 'Ostatnie czyszczenie stanów', 'Останнє очищення станів пристроїв', '最后设备状态清理'],
    ['External change status refresh count', 'Statusabfragen nach externen Änderungen', 'Запросы статуса после внешних изменений', 'Consultas de estado após alterações externas', 'Statusopvragingen na externe wijzigingen', 'Requêtes d’état après changements externes', 'Richieste di stato dopo modifiche esterne', 'Consultas de estado tras cambios externos', 'Zapytania o status po zmianach zewnętrznych', 'Запити статусу після зовнішніх змін', '外部变化后的状态查询次数'],
    ['Last external status refresh trigger', 'Letzte externe Statusabfrage', 'Последний внешний запрос статуса', 'Última consulta de estado externa', 'Laatste externe statusopvraging', 'Dernière requête d’état externe', 'Ultima richiesta di stato esterna', 'Última consulta de estado externa', 'Ostatnie zewnętrzne zapytanie o status', 'Останній зовнішній запит статусу', '最后外部状态查询'],
    ['Periodic status poll count', 'Zähler zyklische Statusabfragen', 'Счётчик периодических запросов статуса', 'Contador de consultas periódicas', 'Teller periodieke statusopvragingen', 'Compteur de requêtes périodiques', 'Contatore richieste periodiche', 'Contador de consultas periódicas', 'Licznik okresowych zapytań', 'Лічильник періодичних запитів', '周期状态查询计数'],
    ['Last periodic status poll', 'Letzte zyklische Statusabfrage', 'Последний периодический запрос статуса', 'Última consulta periódica', 'Laatste periodieke statusopvraging', 'Dernière requête périodique', 'Ultima richiesta periodica', 'Última consulta periódica', 'Ostatnie okresowe zapytanie', 'Останній періодичний запит', '最后周期状态查询'],
    ['Adapter state', 'Adapter-Status', 'Состояние адаптера', 'Estado do adaptador', 'Adapterstatus', 'État de l’adaptateur', 'Stato adattatore', 'Estado del adaptador', 'Stan adaptera', 'Стан адаптера', '适配器状态'],
    ['Pending commands', 'Ausstehende Befehle', 'Ожидающие команды', 'Comandos pendentes', 'Wachtende opdrachten', 'Commandes en attente', 'Comandi in attesa', 'Comandos pendientes', 'Oczekujące polecenia', 'Команди в очікуванні', '待处理命令'],
    ['Command active', 'Befehl aktiv', 'Команда активна', 'Comando ativo', 'Opdracht actief', 'Commande active', 'Comando attivo', 'Comando activo', 'Polecenie aktywne', 'Команда активна', '命令执行中'],
    ['Pairing mode', 'Pairing-Modus', 'Режим сопряжения', 'Modo de emparelhamento', 'Koppelmodus', 'Mode d’appairage', 'Modalità associazione', 'Modo de emparejamiento', 'Tryb parowania', 'Режим сполучення', '配对模式'],
    ['Start pairing for 60 seconds', 'Pairing für 60 Sekunden starten', 'Начать сопряжение на 60 секунд', 'Iniciar emparelhamento por 60 segundos', 'Koppelen 60 seconden starten', 'Démarrer l’appairage pendant 60 secondes', 'Avvia associazione per 60 secondi', 'Iniciar emparejamiento durante 60 segundos', 'Rozpocznij parowanie na 60 sekund', 'Почати сполучення на 60 секунд', '开始配对 60 秒'],
    ['Start unpairing for 60 seconds', 'Unpairing für 60 Sekunden starten', 'Начать отмену сопряжения на 60 секунд', 'Iniciar desemparelhamento por 60 segundos', 'Ontkoppelen 60 seconden starten', 'Démarrer le désappairage pendant 60 secondes', 'Avvia dissociazione per 60 secondi', 'Iniciar desemparejamiento durante 60 segundos', 'Rozpocznij usuwanie parowania na 60 sekund', 'Почати скасування сполучення на 60 секунд', '开始解除配对 60 秒'],
    ['Status broadcast', 'Status-Broadcast', 'Широковещательный запрос статуса', 'Difusão de estado', 'Status-broadcast', 'Diffusion d’état', 'Broadcast di stato', 'Difusión de estado', 'Rozgłoszenie statusu', 'Широкомовний запит статусу', '状态广播'],
    ['Reopen serial port', 'Seriellen Port neu öffnen', 'Повторно открыть последовательный порт', 'Reabrir porta série', 'Seriële poort opnieuw openen', 'Rouvrir le port série', 'Riapri porta seriale', 'Reabrir puerto serie', 'Ponownie otwórz port szeregowy', 'Повторно відкрити послідовний порт', '重新打开串口'],
    ['Send raw 44 digit hex telegram', '44-stelliges Hex-Rohtelegramm senden', 'Отправить 44-значную hex-телеграмму', 'Enviar telegrama hex de 44 dígitos', 'Ruw hex-telegram van 44 tekens verzenden', 'Envoyer un télégramme hex de 44 caractères', 'Invia telegramma esadecimale da 44 cifre', 'Enviar telegrama hex de 44 dígitos', 'Wyślij 44-znakowy telegram hex', 'Надіслати 44-значну hex-телеграму', '发送 44 位十六进制原始报文'],
    ['Remote pair device code', 'Remote-Pair Gerätecode', 'Код устройства для удалённого сопряжения', 'Código de dispositivo para emparelhamento remoto', 'Apparaatcode voor koppelen op afstand', 'Code d’appareil pour appairage à distance', 'Codice dispositivo per associazione remota', 'Código de dispositivo para emparejamiento remoto', 'Kod urządzenia do zdalnego parowania', 'Код пристрою для віддаленого сполучення', '远程配对设备代码'],
    ['Create device by code manually', 'Gerät per Code manuell anlegen', 'Создать устройство по коду вручную', 'Criar dispositivo manualmente por código', 'Apparaat handmatig aanmaken via code', 'Créer un appareil manuellement par code', 'Crea dispositivo manualmente tramite codice', 'Crear dispositivo manualmente por código', 'Utwórz urządzenie ręcznie według kodu', 'Створити пристрій вручну за кодом', '按代码手动创建设备'],
    ['Clean unused device states', 'Ungenutzte Gerätewerte bereinigen', 'Очистить неиспользуемые состояния', 'Limpar estados não utilizados', 'Ongebruikte apparaatstates opschonen', 'Nettoyer les états inutilisés', 'Pulisci stati non utilizzati', 'Limpiar estados no utilizados', 'Wyczyść nieużywane stany', 'Очистити невикористані стани', '清理未使用的设备状态'],

    // --- Geräte-Grundwerte ------------------------------------------------------------------
    ['Last raw telegram', 'Letztes Rohtelegramm', 'Последняя необработанная телеграмма', 'Último telegrama bruto', 'Laatste ruwe telegram', 'Dernier télégramme brut', 'Ultimo telegramma grezzo', 'Último telegrama sin procesar', 'Ostatni surowy telegram', 'Остання сира телеграма', '最后原始报文'],
    ['Last seen', 'Zuletzt gesehen', 'Последняя активность', 'Visto pela última vez', 'Laatst gezien', 'Vu pour la dernière fois', 'Ultima attività', 'Visto por última vez', 'Ostatnio widziany', 'Остання активність', '最后在线'],
    ['Last decoded telegram JSON', 'Letztes dekodiertes Telegramm als JSON', 'Последняя декодированная телеграмма (JSON)', 'Último telegrama descodificado (JSON)', 'Laatst gedecodeerd telegram (JSON)', 'Dernier télégramme décodé (JSON)', 'Ultimo telegramma decodificato (JSON)', 'Último telegrama decodificado (JSON)', 'Ostatni zdekodowany telegram (JSON)', 'Остання декодована телеграма (JSON)', '最后解码报文 (JSON)'],
    ['Message type', 'Nachrichtentyp', 'Тип сообщения', 'Tipo de mensagem', 'Berichttype', 'Type de message', 'Tipo di messaggio', 'Tipo de mensaje', 'Typ wiadomości', 'Тип повідомлення', '消息类型'],
    ['Channel', 'Kanal', 'Канал', 'Canal', 'Kanaal', 'Canal', 'Canale', 'Canal', 'Kanał', 'Канал', '通道'],
    ['Payload', 'Nutzdaten', 'Полезные данные', 'Dados úteis', 'Payload', 'Données utiles', 'Dati utili', 'Datos útiles', 'Dane użytkowe', 'Корисні дані', '有效载荷'],
    ['Source code', 'Quellcode', 'Код источника', 'Código de origem', 'Broncode', 'Code source', 'Codice sorgente', 'Código de origen', 'Kod źródłowy', 'Код джерела', '源代码'],
    ['Target code', 'Zielcode', 'Код назначения', 'Código de destino', 'Doelcode', 'Code cible', 'Codice destinazione', 'Código de destino', 'Kod docelowy', 'Код призначення', '目标代码'],
    ['Device class', 'Geräteklasse', 'Класс устройства', 'Classe do dispositivo', 'Apparaatklasse', 'Classe d’appareil', 'Classe dispositivo', 'Clase de dispositivo', 'Klasa urządzenia', 'Клас пристрою', '设备类别'],
    ['Device profile', 'Geräteprofil', 'Профиль устройства', 'Perfil do dispositivo', 'Apparaatprofiel', 'Profil d’appareil', 'Profilo dispositivo', 'Perfil de dispositivo', 'Profil urządzenia', 'Профіль пристрою', '设备配置文件'],
    ['Text command', 'Textbefehl', 'Текстовая команда', 'Comando de texto', 'Tekstopdracht', 'Commande texte', 'Comando testuale', 'Comando de texto', 'Polecenie tekstowe', 'Текстова команда', '文本命令'],
    ['Last command', 'Letzter Befehl', 'Последняя команда', 'Último comando', 'Laatste opdracht', 'Dernière commande', 'Ultimo comando', 'Último comando', 'Ostatnie polecenie', 'Остання команда', '最后命令'],
    ['Last command time', 'Zeit letzter Befehl', 'Время последней команды', 'Hora do último comando', 'Tijd laatste opdracht', 'Heure de la dernière commande', 'Ora ultimo comando', 'Hora del último comando', 'Czas ostatniego polecenia', 'Час останньої команди', '最后命令时间'],
    ['Status group', 'Statusgruppe', 'Группа статуса', 'Grupo de estado', 'Statusgroep', 'Groupe d’état', 'Gruppo di stato', 'Grupo de estado', 'Grupa statusu', 'Група статусу', '状态组'],
    ['Status payload', 'Status-Nutzdaten', 'Данные статуса', 'Dados de estado', 'Statusgegevens', 'Données d’état', 'Dati di stato', 'Datos de estado', 'Dane statusu', 'Дані статусу', '状态数据'],
    ['Status payload offset', 'Status-Nutzdaten Offset', 'Смещение данных статуса', 'Deslocamento dos dados de estado', 'Offset statusgegevens', 'Décalage des données d’état', 'Offset dati di stato', 'Desplazamiento de datos de estado', 'Przesunięcie danych statusu', 'Зміщення даних статусу', '状态数据偏移'],
    ['State text', 'Status Text', 'Текст состояния', 'Texto de estado', 'Statustekst', 'Texte d’état', 'Testo di stato', 'Texto de estado', 'Tekst stanu', 'Текст стану', '状态文本'],

    // --- Position, Level, Schalten ----------------------------------------------------------
    ['Position', 'Position', 'Положение', 'Posição', 'Positie', 'Position', 'Posizione', 'Posición', 'Pozycja', 'Положення', '位置'],
    ['Position / set position', 'Position / Position setzen', 'Положение / задать положение', 'Posição / definir posição', 'Positie / positie instellen', 'Position / définir la position', 'Posizione / imposta posizione', 'Posición / ajustar posición', 'Pozycja / ustaw pozycję', 'Положення / задати положення', '位置 / 设置位置'],
    ['Raw DuoFern position', 'Rohposition DuoFern', 'Исходное положение DuoFern', 'Posição DuoFern original', 'Ruwe DuoFern-positie', 'Position DuoFern brute', 'Posizione DuoFern grezza', 'Posición DuoFern sin procesar', 'Surowa pozycja DuoFern', 'Сире положення DuoFern', 'DuoFern 原始位置'],
    ['Target position', 'Zielposition', 'Целевое положение', 'Posição alvo', 'Doelpositie', 'Position cible', 'Posizione di destinazione', 'Posición objetivo', 'Pozycja docelowa', 'Цільове положення', '目标位置'],
    ['Level', 'Level', 'Уровень', 'Nível', 'Niveau', 'Niveau', 'Livello', 'Nivel', 'Poziom', 'Рівень', '亮度'],
    ['Level / set level', 'Level / Level setzen', 'Уровень / задать уровень', 'Nível / definir nível', 'Niveau / niveau instellen', 'Niveau / définir le niveau', 'Livello / imposta livello', 'Nivel / ajustar nivel', 'Poziom / ustaw poziom', 'Рівень / задати рівень', '亮度 / 设置亮度'],
    ['Target level', 'Ziel-Level', 'Целевой уровень', 'Nível alvo', 'Doelniveau', 'Niveau cible', 'Livello di destinazione', 'Nivel objetivo', 'Poziom docelowy', 'Цільовий рівень', '目标亮度'],
    ['State', 'Zustand', 'Состояние', 'Estado', 'Toestand', 'État', 'Stato', 'Estado', 'Stan', 'Стан', '状态'],
    ['State / switch', 'Zustand / Schalten', 'Состояние / переключить', 'Estado / comutar', 'Toestand / schakelen', 'État / commuter', 'Stato / commuta', 'Estado / conmutar', 'Stan / przełącz', 'Стан / перемкнути', '状态 / 开关'],
    ['Moving', 'Bewegung', 'Движение', 'Movimento', 'Beweging', 'Mouvement', 'Movimento', 'Movimiento', 'Ruch', 'Рух', '运动'],
    ['Up', 'Hoch', 'Вверх', 'Subir', 'Omhoog', 'Monter', 'Su', 'Subir', 'W górę', 'Вгору', '上升'],
    ['Down', 'Runter', 'Вниз', 'Descer', 'Omlaag', 'Descendre', 'Giù', 'Bajar', 'W dół', 'Вниз', '下降'],
    ['Stop', 'Stopp', 'Стоп', 'Parar', 'Stop', 'Arrêt', 'Stop', 'Parar', 'Stop', 'Стоп', '停止'],
    ['Toggle', 'Umschalten', 'Переключить', 'Alternar', 'Omschakelen', 'Basculer', 'Commuta', 'Alternar', 'Przełącz', 'Перемкнути', '切换'],
    ['Get status', 'Status abfragen', 'Запросить статус', 'Consultar estado', 'Status opvragen', 'Demander l’état', 'Richiedi stato', 'Consultar estado', 'Pobierz status', 'Запитати статус', '查询状态'],
    ['Switch on', 'Einschalten', 'Включить', 'Ligar', 'Inschakelen', 'Allumer', 'Accendi', 'Encender', 'Włącz', 'Увімкнути', '打开'],
    ['Switch off', 'Ausschalten', 'Выключить', 'Desligar', 'Uitschakelen', 'Éteindre', 'Spegni', 'Apagar', 'Wyłącz', 'Вимкнути', '关闭'],

    // --- Automatiken und Modi ---------------------------------------------------------------
    ['Manual mode', 'Manueller Modus', 'Ручной режим', 'Modo manual', 'Handmatige modus', 'Mode manuel', 'Modalità manuale', 'Modo manual', 'Tryb ręczny', 'Ручний режим', '手动模式'],
    ['Time automatic', 'Zeitautomatik', 'Автоматика по времени', 'Automático por horário', 'Tijdautomaat', 'Automatisme horaire', 'Automatismo orario', 'Automático por horario', 'Automatyka czasowa', 'Автоматика за часом', '定时自动'],
    ['Sun automatic', 'Sonnenautomatik', 'Солнечная автоматика', 'Automático solar', 'Zonautomaat', 'Automatisme solaire', 'Automatismo solare', 'Automático solar', 'Automatyka słoneczna', 'Сонячна автоматика', '阳光自动'],
    ['Dusk automatic', 'Abenddämmerungsautomatik', 'Автоматика сумерек', 'Automático crepuscular', 'Schemerautomaat avond', 'Automatisme crépuscule', 'Automatismo crepuscolo', 'Automático crepuscular', 'Automatyka zmierzchowa', 'Автоматика сутінків', '黄昏自动'],
    ['Dawn automatic', 'Morgendämmerungsautomatik', 'Автоматика рассвета', 'Automático de amanhecer', 'Schemerautomaat ochtend', 'Automatisme aube', 'Automatismo alba', 'Automático de amanecer', 'Automatyka świtu', 'Автоматика світанку', '黎明自动'],
    ['Wind automatic', 'Windautomatik', 'Автоматика ветра', 'Automático de vento', 'Windautomaat', 'Automatisme vent', 'Automatismo vento', 'Automático de viento', 'Automatyka wiatrowa', 'Автоматика вітру', '风力自动'],
    ['Rain automatic', 'Regenautomatik', 'Автоматика дождя', 'Automático de chuva', 'Regenautomaat', 'Automatisme pluie', 'Automatismo pioggia', 'Automático de lluvia', 'Automatyka deszczowa', 'Автоматика дощу', '雨水自动'],
    ['Sun mode', 'Sonnenmodus', 'Солнечный режим', 'Modo solar', 'Zonmodus', 'Mode soleil', 'Modalità sole', 'Modo solar', 'Tryb słoneczny', 'Сонячний режим', '阳光模式'],
    ['Wind mode', 'Windmodus', 'Режим ветра', 'Modo vento', 'Windmodus', 'Mode vent', 'Modalità vento', 'Modo viento', 'Tryb wiatrowy', 'Режим вітру', '风力模式'],
    ['Rain mode', 'Regenmodus', 'Режим дождя', 'Modo chuva', 'Regenmodus', 'Mode pluie', 'Modalità pioggia', 'Modo lluvia', 'Tryb deszczowy', 'Режим дощу', '雨水模式'],
    ['Ventilating mode', 'Lüftungsmodus', 'Режим проветривания', 'Modo de ventilação', 'Ventilatiemodus', 'Mode aération', 'Modalità ventilazione', 'Modo de ventilación', 'Tryb wietrzenia', 'Режим провітрювання', '通风模式'],
    ['Ventilating position', 'Lüftungsposition', 'Положение проветривания', 'Posição de ventilação', 'Ventilatiepositie', 'Position d’aération', 'Posizione di ventilazione', 'Posición de ventilación', 'Pozycja wietrzenia', 'Положення провітрювання', '通风位置'],
    ['Sun position', 'Sonnenposition', 'Положение защиты от солнца', 'Posição solar', 'Zonpositie', 'Position soleil', 'Posizione sole', 'Posición solar', 'Pozycja słoneczna', 'Положення захисту від сонця', '遮阳位置'],
    ['Running time', 'Laufzeit', 'Время хода', 'Tempo de funcionamento', 'Looptijd', 'Durée de course', 'Tempo di corsa', 'Tiempo de recorrido', 'Czas pracy', 'Час ходу', '运行时间'],
    ['Intermediate mode', 'Zwischenwert-Modus', 'Режим промежуточного положения', 'Modo de posição intermédia', 'Tussenpositiemodus', 'Mode position intermédiaire', 'Modalità posizione intermedia', 'Modo de posición intermedia', 'Tryb pozycji pośredniej', 'Режим проміжного положення', '中间位置模式'],
    ['Intermediate value', 'Zwischenwert', 'Промежуточное положение', 'Posição intermédia', 'Tussenpositie', 'Position intermédiaire', 'Posizione intermedia', 'Posición intermedia', 'Pozycja pośrednia', 'Проміжне положення', '中间位置'],
    ['Save intermediate value on stop', 'Zwischenwert bei Stopp speichern', 'Сохранять промежуточное положение при остановке', 'Guardar posição intermédia ao parar', 'Tussenpositie opslaan bij stop', 'Enregistrer la position intermédiaire à l’arrêt', 'Salva posizione intermedia allo stop', 'Guardar posición intermedia al parar', 'Zapisz pozycję pośrednią przy zatrzymaniu', 'Зберігати проміжне положення при зупинці', '停止时保存中间位置'],
    ['Slat position', 'Lamellenposition', 'Положение ламелей', 'Posição das lâminas', 'Lamelpositie', 'Position des lamelles', 'Posizione lamelle', 'Posición de lamas', 'Pozycja lameli', 'Положення ламелей', '叶片位置'],
    ['Slat running time', 'Lamellenlaufzeit', 'Время хода ламелей', 'Tempo de rotação das lâminas', 'Looptijd lamellen', 'Durée de rotation des lamelles', 'Tempo di rotazione lamelle', 'Tiempo de giro de lamas', 'Czas obrotu lameli', 'Час ходу ламелей', '叶片运行时间'],
    ['Default slat position', 'Standard-Lamellenposition', 'Положение ламелей по умолчанию', 'Posição padrão das lâminas', 'Standaard lamelpositie', 'Position des lamelles par défaut', 'Posizione lamelle predefinita', 'Posición de lamas predeterminada', 'Domyślna pozycja lameli', 'Положення ламелей за замовчуванням', '默认叶片位置'],
    ['Venetian blind mode', 'Jalousiemodus', 'Режим жалюзи', 'Modo estore veneziano', 'Jaloeziemodus', 'Mode store vénitien', 'Modalità veneziana', 'Modo persiana veneciana', 'Tryb żaluzji', 'Режим жалюзі', '百叶窗模式'],
    ['Tilt after moving to position', 'Wenden nach Positionsfahrt', 'Поворот ламелей после выхода в положение', 'Inclinar após mover para posição', 'Kantelen na positierit', 'Orienter après déplacement en position', 'Inclina dopo spostamento in posizione', 'Inclinar tras mover a posición', 'Obrót lameli po dojeździe do pozycji', 'Поворот ламелей після виходу в положення', '到位后翻转'],
    ['Tilt after stop when moving down', 'Wenden nach Stopp in Abwärtsfahrt', 'Поворот ламелей после остановки при движении вниз', 'Inclinar após parar ao descer', 'Kantelen na stop bij omlaag', 'Orienter après arrêt en descente', 'Inclina dopo stop in discesa', 'Inclinar tras parar al bajar', 'Obrót lameli po zatrzymaniu w dół', 'Поворот ламелей після зупинки вниз', '下降停止后翻转'],
    ['Tilt in sun position', 'Wenden in Sonnenposition', 'Поворот ламелей в положении защиты от солнца', 'Inclinar na posição solar', 'Kantelen in zonpositie', 'Orienter en position soleil', 'Inclina in posizione sole', 'Inclinar en posición solar', 'Obrót lameli w pozycji słonecznej', 'Поворот ламелей у сонячному положенні', '遮阳位置翻转'],
    ['Tilt in ventilating position', 'Wenden in Lüftungsposition', 'Поворот ламелей в положении проветривания', 'Inclinar na posição de ventilação', 'Kantelen in ventilatiepositie', 'Orienter en position d’aération', 'Inclina in posizione di ventilazione', 'Inclinar en posición de ventilación', 'Obrót lameli w pozycji wietrzenia', 'Поворот ламелей у положенні провітрювання', '通风位置翻转'],
    ['Motor dead time', 'Motor-Totzeit', 'Мёртвое время двигателя', 'Tempo morto do motor', 'Dode tijd motor', 'Temps mort du moteur', 'Tempo morto motore', 'Tiempo muerto del motor', 'Czas martwy silnika', 'Мертвий час двигуна', '电机死区时间'],
    ['Reversal of direction', 'Drehrichtungsumkehr', 'Реверс направления', 'Inversão do sentido', 'Omkering draairichting', 'Inversion du sens', 'Inversione direzione', 'Inversión de sentido', 'Odwrócenie kierunku', 'Реверс напрямку', '方向反转'],
    ['Mode change', 'Moduswechsel', 'Смена режима', 'Mudança de modo', 'Moduswissel', 'Changement de mode', 'Cambio modalità', 'Cambio de modo', 'Zmiana trybu', 'Зміна режиму', '模式切换'],
    ['Rain direction', 'Regen-Fahrtrichtung', 'Направление при дожде', 'Direção com chuva', 'Richting bij regen', 'Direction en cas de pluie', 'Direzione con pioggia', 'Dirección con lluvia', 'Kierunek przy deszczu', 'Напрямок при дощі', '雨天方向'],
    ['Wind direction', 'Wind-Fahrtrichtung', 'Направление при ветре', 'Direção com vento', 'Richting bij wind', 'Direction en cas de vent', 'Direzione con vento', 'Dirección con viento', 'Kierunek przy wietrze', 'Напрямок при вітрі', '大风方向'],
    ['Move to dusk position', 'Abenddämmerungsposition anfahren', 'Перейти в положение сумерек', 'Mover para posição crepuscular', 'Naar schemerpositie avond', 'Aller en position crépuscule', 'Vai a posizione crepuscolo', 'Mover a posición crepuscular', 'Przejdź do pozycji zmierzchowej', 'Перейти в положення сутінків', '移至黄昏位置'],
    ['Move to dawn position', 'Morgendämmerungsposition anfahren', 'Перейти в положение рассвета', 'Mover para posição de amanhecer', 'Naar schemerpositie ochtend', 'Aller en position aube', 'Vai a posizione alba', 'Mover a posición de amanecer', 'Przejdź do pozycji świtu', 'Перейти в положення світанку', '移至黎明位置'],
    ['Stairwell function', 'Treppenhausfunktion', 'Функция лестничного освещения', 'Função de escada', 'Trappenhuisfunctie', 'Fonction minuterie d’escalier', 'Funzione luce scale', 'Función de escalera', 'Funkcja klatki schodowej', 'Функція сходового освітлення', '楼梯灯功能'],
    ['Stairwell time', 'Treppenhauszeit', 'Время лестничного освещения', 'Tempo de escada', 'Trappenhuistijd', 'Durée minuterie d’escalier', 'Tempo luce scale', 'Tiempo de escalera', 'Czas klatki schodowej', 'Час сходового освітлення', '楼梯灯时间'],

    // --- Funk / Pairing / Diagnose ----------------------------------------------------------
    ['Remote pairing', 'Fern-Pairing', 'Удалённое сопряжение', 'Emparelhamento remoto', 'Koppelen op afstand', 'Appairage à distance', 'Associazione remota', 'Emparejamiento remoto', 'Zdalne parowanie', 'Віддалене сполучення', '远程配对'],
    ['Remote unpairing', 'Fern-Unpairing', 'Удалённая отмена сопряжения', 'Desemparelhamento remoto', 'Ontkoppelen op afstand', 'Désappairage à distance', 'Dissociazione remota', 'Desemparejamiento remoto', 'Zdalne usunięcie parowania', 'Віддалене скасування сполучення', '远程解除配对'],
    ['Reset', 'Zurücksetzen', 'Сброс', 'Repor', 'Resetten', 'Réinitialiser', 'Reimposta', 'Restablecer', 'Resetuj', 'Скинути', '重置'],
    ['Firmware version', 'Firmware-Version', 'Версия прошивки', 'Versão do firmware', 'Firmwareversie', 'Version du micrologiciel', 'Versione firmware', 'Versión de firmware', 'Wersja oprogramowania', 'Версія прошивки', '固件版本'],

    // --- Wetterstation / Umweltsensor -------------------------------------------------------
    ['Get weather data', 'Wetterdaten abfragen', 'Запросить погодные данные', 'Consultar dados meteorológicos', 'Weergegevens opvragen', 'Demander les données météo', 'Richiedi dati meteo', 'Consultar datos meteorológicos', 'Pobierz dane pogodowe', 'Запитати погодні дані', '查询天气数据'],
    ['Get time', 'Uhrzeit abfragen', 'Запросить время', 'Consultar hora', 'Tijd opvragen', 'Demander l’heure', 'Richiedi ora', 'Consultar hora', 'Pobierz czas', 'Запитати час', '查询时间'],
    ['Set time', 'Uhrzeit setzen', 'Установить время', 'Definir hora', 'Tijd instellen', 'Régler l’heure', 'Imposta ora', 'Ajustar hora', 'Ustaw czas', 'Встановити час', '设置时间'],
    ['Read configuration', 'Konfiguration lesen', 'Прочитать конфигурацию', 'Ler configuração', 'Configuratie lezen', 'Lire la configuration', 'Leggi configurazione', 'Leer configuración', 'Odczytaj konfigurację', 'Прочитати конфігурацію', '读取配置'],
    ['Write configuration', 'Konfiguration schreiben', 'Записать конфигурацию', 'Gravar configuração', 'Configuratie schrijven', 'Écrire la configuration', 'Scrivi configurazione', 'Escribir configuración', 'Zapisz konfigurację', 'Записати конфігурацію', '写入配置'],
    ['DCF time signal', 'DCF-Zeitsignal', 'Сигнал времени DCF', 'Sinal horário DCF', 'DCF-tijdsignaal', 'Signal horaire DCF', 'Segnale orario DCF', 'Señal horaria DCF', 'Sygnał czasu DCF', 'Сигнал часу DCF', 'DCF 时间信号'],
    ['Interval', 'Intervall', 'Интервал', 'Intervalo', 'Interval', 'Intervalle', 'Intervallo', 'Intervalo', 'Interwał', 'Інтервал', '间隔'],
    ['Sending interval', 'Sendeintervall', 'Интервал отправки', 'Intervalo de envio', 'Verzendinterval', 'Intervalle d’envoi', 'Intervallo di invio', 'Intervalo de envío', 'Interwał wysyłania', 'Інтервал надсилання', '发送间隔'],
    ['Latitude', 'Breitengrad', 'Широта', 'Latitude', 'Breedtegraad', 'Latitude', 'Latitudine', 'Latitud', 'Szerokość geograficzna', 'Широта', '纬度'],
    ['Longitude', 'Längengrad', 'Долгота', 'Longitude', 'Lengtegraad', 'Longitude', 'Longitudine', 'Longitud', 'Długość geograficzna', 'Довгота', '经度'],
    ['Time zone', 'Zeitzone', 'Часовой пояс', 'Fuso horário', 'Tijdzone', 'Fuseau horaire', 'Fuso orario', 'Zona horaria', 'Strefa czasowa', 'Часовий пояс', '时区'],
    ['Dawn trigger', 'Auslöser Morgendämmerung', 'Порог рассвета', 'Limiar de amanhecer', 'Drempel ochtendschemer', 'Seuil d’aube', 'Soglia alba', 'Umbral de amanecer', 'Próg świtu', 'Поріг світанку', '黎明触发值'],
    ['Dusk trigger', 'Auslöser Abenddämmerung', 'Порог сумерек', 'Limiar crepuscular', 'Drempel avondschemer', 'Seuil de crépuscule', 'Soglia crepuscolo', 'Umbral crepuscular', 'Próg zmierzchu', 'Поріг сутінків', '黄昏触发值'],
    ['Rain trigger', 'Auslöser Regen', 'Порог дождя', 'Limiar de chuva', 'Drempel regen', 'Seuil de pluie', 'Soglia pioggia', 'Umbral de lluvia', 'Próg deszczu', 'Поріг дощу', '雨水触发值'],
    ['Sun trigger', 'Auslöser Sonne', 'Порог солнца', 'Limiar solar', 'Drempel zon', 'Seuil de soleil', 'Soglia sole', 'Umbral solar', 'Próg słońca', 'Поріг сонця', '阳光触发值'],
    ['Sun direction trigger', 'Auslöser Sonnenrichtung', 'Порог направления солнца', 'Limiar de direção solar', 'Drempel zonrichting', 'Seuil de direction du soleil', 'Soglia direzione sole', 'Umbral de dirección solar', 'Próg kierunku słońca', 'Поріг напрямку сонця', '太阳方位触发值'],
    ['Sun height trigger', 'Auslöser Sonnenhöhe', 'Порог высоты солнца', 'Limiar de altura solar', 'Drempel zonnehoogte', 'Seuil de hauteur du soleil', 'Soglia altezza sole', 'Umbral de altura solar', 'Próg wysokości słońca', 'Поріг висоти сонця', '太阳高度触发值'],
    ['Temperature trigger', 'Auslöser Temperatur', 'Порог температуры', 'Limiar de temperatura', 'Drempel temperatuur', 'Seuil de température', 'Soglia temperatura', 'Umbral de temperatura', 'Próg temperatury', 'Поріг температури', '温度触发值'],
    ['Wind trigger', 'Auslöser Wind', 'Порог ветра', 'Limiar de vento', 'Drempel wind', 'Seuil de vent', 'Soglia vento', 'Umbral de viento', 'Próg wiatru', 'Поріг вітру', '风力触发值'],

    // --- Heizung ----------------------------------------------------------------------------
    ['Desired temperature', 'Solltemperatur', 'Заданная температура', 'Temperatura desejada', 'Gewenste temperatuur', 'Température de consigne', 'Temperatura desiderata', 'Temperatura deseada', 'Temperatura zadana', 'Задана температура', '设定温度'],
    ['Measured temperature', 'Gemessene Temperatur', 'Измеренная температура', 'Temperatura medida', 'Gemeten temperatuur', 'Température mesurée', 'Temperatura misurata', 'Temperatura medida', 'Zmierzona temperatura', 'Виміряна температура', '测量温度'],
    ['Measured temperature 2', 'Gemessene Temperatur 2', 'Измеренная температура 2', 'Temperatura medida 2', 'Gemeten temperatuur 2', 'Température mesurée 2', 'Temperatura misurata 2', 'Temperatura medida 2', 'Zmierzona temperatura 2', 'Виміряна температура 2', '测量温度 2'],
    ['Temperature up', 'Temperatur erhöhen', 'Повысить температуру', 'Aumentar temperatura', 'Temperatuur verhogen', 'Augmenter la température', 'Aumenta temperatura', 'Subir temperatura', 'Zwiększ temperaturę', 'Підвищити температуру', '升高温度'],
    ['Temperature down', 'Temperatur senken', 'Понизить температуру', 'Diminuir temperatura', 'Temperatuur verlagen', 'Baisser la température', 'Diminuisci temperatura', 'Bajar temperatura', 'Zmniejsz temperaturę', 'Знизити температуру', '降低温度'],
    ['Temperature threshold 1', 'Temperaturschwelle 1', 'Порог температуры 1', 'Limiar de temperatura 1', 'Temperatuurdrempel 1', 'Seuil de température 1', 'Soglia temperatura 1', 'Umbral de temperatura 1', 'Próg temperatury 1', 'Поріг температури 1', '温度阈值 1'],
    ['Temperature threshold 2', 'Temperaturschwelle 2', 'Порог температуры 2', 'Limiar de temperatura 2', 'Temperatuurdrempel 2', 'Seuil de température 2', 'Soglia temperatura 2', 'Umbral de temperatura 2', 'Próg temperatury 2', 'Поріг температури 2', '温度阈值 2'],
    ['Temperature threshold 3', 'Temperaturschwelle 3', 'Порог температуры 3', 'Limiar de temperatura 3', 'Temperatuurdrempel 3', 'Seuil de température 3', 'Soglia temperatura 3', 'Umbral de temperatura 3', 'Próg temperatury 3', 'Поріг температури 3', '温度阈值 3'],
    ['Temperature threshold 4', 'Temperaturschwelle 4', 'Порог температуры 4', 'Limiar de temperatura 4', 'Temperatuurdrempel 4', 'Seuil de température 4', 'Soglia temperatura 4', 'Umbral de temperatura 4', 'Próg temperatury 4', 'Поріг температури 4', '温度阈值 4'],
    ['Active temperature limit', 'Aktive Temperaturgrenze', 'Активный предел температуры', 'Limite de temperatura ativo', 'Actieve temperatuurgrens', 'Limite de température active', 'Limite di temperatura attivo', 'Límite de temperatura activo', 'Aktywny limit temperatury', 'Активна межа температури', '当前温度上限'],
    ['Output', 'Ausgang', 'Выход', 'Saída', 'Uitgang', 'Sortie', 'Uscita', 'Salida', 'Wyjście', 'Вихід', '输出'],
    ['Manual override', 'Manuelle Übersteuerung', 'Ручное управление', 'Controlo manual', 'Handmatige overschrijving', 'Forçage manuel', 'Comando manuale forzato', 'Control manual forzado', 'Ręczne sterowanie', 'Ручне керування', '手动覆盖'],
    ['Battery', 'Batterie', 'Батарея', 'Bateria', 'Batterij', 'Batterie', 'Batteria', 'Batería', 'Bateria', 'Батарея', '电池'],
    ['Valve position', 'Ventilstellung', 'Положение клапана', 'Posição da válvula', 'Klepstand', 'Position de la vanne', 'Posizione valvola', 'Posición de la válvula', 'Pozycja zaworu', 'Положення клапана', '阀门位置'],
    ['Force response', 'Antwort erzwingen', 'Принудительный ответ', 'Forçar resposta', 'Antwoord afdwingen', 'Forcer la réponse', 'Forza risposta', 'Forzar respuesta', 'Wymuś odpowiedź', 'Примусова відповідь', '强制响应'],
    ['Window contact', 'Fensterkontakt', 'Оконный контакт', 'Contacto de janela', 'Raamcontact', 'Contact de fenêtre', 'Contatto finestra', 'Contacto de ventana', 'Kontaktron okienny', 'Віконний контакт', '窗户触点'],

    // --- Garagentor (SX5) -------------------------------------------------------------------
    ['Automatic closing', 'Automatisches Schließen', 'Автоматическое закрытие', 'Fecho automático', 'Automatisch sluiten', 'Fermeture automatique', 'Chiusura automatica', 'Cierre automático', 'Automatyczne zamykanie', 'Автоматичне закриття', '自动关闭'],
    ['Opening speed', 'Öffnungsgeschwindigkeit', 'Скорость открытия', 'Velocidade de abertura', 'Openingssnelheid', 'Vitesse d’ouverture', 'Velocità di apertura', 'Velocidad de apertura', 'Prędkość otwierania', 'Швидкість відкриття', '开启速度'],
    ['Back jump', 'Rücksprung', 'Обратный ход', 'Recuo', 'Terugsprong', 'Recul', 'Ritorno', 'Retroceso', 'Cofnięcie', 'Зворотний хід', '回退'],
    ['10-minute alarm', '10-Minuten-Alarm', '10-минутный сигнал', 'Alarme de 10 minutos', '10-minutenalarm', 'Alarme 10 minutes', 'Allarme 10 minuti', 'Alarma de 10 minutos', 'Alarm 10-minutowy', '10-хвилинний сигнал', '10 分钟报警'],
    ['2000-cycle alarm', '2000-Zyklen-Alarm', 'Сигнал 2000 циклов', 'Alarme de 2000 ciclos', '2000-cycli-alarm', 'Alarme 2000 cycles', 'Allarme 2000 cicli', 'Alarma de 2000 ciclos', 'Alarm 2000 cykli', 'Сигнал 2000 циклів', '2000 次循环报警'],
    ['Obstacle', 'Hindernis', 'Препятствие', 'Obstáculo', 'Obstakel', 'Obstacle', 'Ostacolo', 'Obstáculo', 'Przeszkoda', 'Перешкода', '障碍物'],
    ['Obstacle detection', 'Hinderniserkennung', 'Обнаружение препятствий', 'Deteção de obstáculos', 'Obstakeldetectie', 'Détection d’obstacle', 'Rilevamento ostacoli', 'Detección de obstáculos', 'Wykrywanie przeszkód', 'Виявлення перешкод', '障碍物检测'],
    ['Blocked', 'Blockiert', 'Заблокировано', 'Bloqueado', 'Geblokkeerd', 'Bloqué', 'Bloccato', 'Bloqueado', 'Zablokowany', 'Заблоковано', '受阻'],
    ['Block detection', 'Blockiererkennung', 'Обнаружение блокировки', 'Deteção de bloqueio', 'Blokkeerdetectie', 'Détection de blocage', 'Rilevamento blocco', 'Detección de bloqueo', 'Wykrywanie blokady', 'Виявлення блокування', '阻塞检测'],
    ['Light curtain', 'Lichtschranke', 'Световой барьер', 'Barreira de luz', 'Lichtsluis', 'Barrière lumineuse', 'Barriera fotoelettrica', 'Barrera de luz', 'Kurtyna świetlna', 'Світловий бар’єр', '光幕'],
    ['Wicket door', 'Schlupftür', 'Калитка', 'Porta de passagem', 'Loopdeur', 'Portillon', 'Porta pedonale', 'Puerta peatonal', 'Furtka', 'Хвіртка', '小门'],
    ['Light', 'Licht', 'Свет', 'Luz', 'Licht', 'Lumière', 'Luce', 'Luz', 'Światło', 'Світло', '灯光'],
];

// Technische Bezeichner (State-IDs / Befehle) → englischer Anzeigetext aus TABLE.
const KEY_TO_EN = {
    position: 'Position',
    level: 'Level',
    state: 'State',
    up: 'Up',
    down: 'Down',
    stop: 'Stop',
    toggle: 'Toggle',
    getStatus: 'Get status',
    on: 'Switch on',
    off: 'Switch off',
    manualMode: 'Manual mode',
    timeAutomatic: 'Time automatic',
    sunAutomatic: 'Sun automatic',
    duskAutomatic: 'Dusk automatic',
    dawnAutomatic: 'Dawn automatic',
    windAutomatic: 'Wind automatic',
    rainAutomatic: 'Rain automatic',
    sunMode: 'Sun mode',
    windMode: 'Wind mode',
    rainMode: 'Rain mode',
    ventilatingMode: 'Ventilating mode',
    ventilatingPosition: 'Ventilating position',
    sunPosition: 'Sun position',
    runningTime: 'Running time',
    intermediateMode: 'Intermediate mode',
    intermediateValue: 'Intermediate value',
    saveIntermediateOnStop: 'Save intermediate value on stop',
    slatPosition: 'Slat position',
    slatRunTime: 'Slat running time',
    defaultSlatPos: 'Default slat position',
    blindsMode: 'Venetian blind mode',
    blindsModeSwitch: 'Venetian blind mode',
    tiltAfterMoveLevel: 'Tilt after moving to position',
    tiltAfterStopDown: 'Tilt after stop when moving down',
    tiltInSunPos: 'Tilt in sun position',
    tiltInVentPos: 'Tilt in ventilating position',
    motorDeadTime: 'Motor dead time',
    reversal: 'Reversal of direction',
    modeChange: 'Mode change',
    rainDirection: 'Rain direction',
    windDirection: 'Wind direction',
    dusk: 'Move to dusk position',
    dawn: 'Move to dawn position',
    stairwellFunction: 'Stairwell function',
    stairwellTime: 'Stairwell time',
    remotePair: 'Remote pairing',
    remoteUnpair: 'Remote unpairing',
    reset: 'Reset',
    version: 'Firmware version',
    getWeather: 'Get weather data',
    getTime: 'Get time',
    time: 'Set time',
    getConfig: 'Read configuration',
    writeConfig: 'Write configuration',
    DCF: 'DCF time signal',
    interval: 'Interval',
    sendingInterval: 'Sending interval',
    latitude: 'Latitude',
    longitude: 'Longitude',
    timezone: 'Time zone',
    triggerDawn: 'Dawn trigger',
    triggerDusk: 'Dusk trigger',
    triggerRain: 'Rain trigger',
    triggerSun: 'Sun trigger',
    triggerSunDirection: 'Sun direction trigger',
    triggerSunHeight: 'Sun height trigger',
    triggerTemperature: 'Temperature trigger',
    triggerWind: 'Wind trigger',
    'desired-temp': 'Desired temperature',
    desiredTemp: 'Desired temperature',
    'measured-temp': 'Measured temperature',
    'measured-temp2': 'Measured temperature 2',
    tempUp: 'Temperature up',
    tempDown: 'Temperature down',
    temperatureThreshold1: 'Temperature threshold 1',
    temperatureThreshold2: 'Temperature threshold 2',
    temperatureThreshold3: 'Temperature threshold 3',
    temperatureThreshold4: 'Temperature threshold 4',
    actTempLimit: 'Active temperature limit',
    output: 'Output',
    manualOverride: 'Manual override',
    batteryPercent: 'Battery',
    valvePosition: 'Valve position',
    forceResponse: 'Force response',
    windowContact: 'Window contact',
    automaticClosing: 'Automatic closing',
    openSpeed: 'Opening speed',
    backJump: 'Back jump',
    '10minuteAlarm': '10-minute alarm',
    '2000cycleAlarm': '2000-cycle alarm',
    obstacle: 'Obstacle',
    obstacleDetection: 'Obstacle detection',
    block: 'Blocked',
    blockDetection: 'Block detection',
    lightCurtain: 'Light curtain',
    wicketDoor: 'Wicket door',
    light: 'Light',
};

const BY_EN = new Map();
for (const row of TABLE) {
    const entry = {};
    LANGUAGES.forEach((lang, i) => (entry[lang] = row[i]));
    BY_EN.set(row[0], entry);
}

/**
 * Liefert die vollständige Übersetzung zu einem englischen Text oder technischen Bezeichner.
 *
 * @param {string} text englischer Text oder technischer Bezeichner
 * @returns {Record<string, string>|null} Objekt mit allen Sprachen oder null
 */
function lookup(text) {
    if (typeof text !== 'string') {
        return null;
    }
    const entry = BY_EN.get(text) || BY_EN.get(KEY_TO_EN[text]);
    return entry ? { ...entry } : null;
}

/**
 * Ergänzt einen Objektnamen um alle Sprachen.
 *
 * @param {string|Record<string, string>|undefined} name Name als String oder { en, de }
 * @returns {string|Record<string, string>|undefined} Name mit allen Sprachen oder einfacher String
 */
function localizeName(name) {
    if (name === undefined || name === null) {
        return name;
    }
    const en = typeof name === 'string' ? name : name.en;
    if (typeof en !== 'string') {
        return name;
    }

    const direct = lookup(en);
    if (direct) {
        return direct;
    }

    // "Control <befehl>" → "Steuerung: <Befehl>" in allen Sprachen
    const control = /^Control (.+)$/.exec(en);
    if (control) {
        const prefix = BY_EN.get('Control');
        const target = lookup(control[1]);
        if (prefix && target) {
            const result = {};
            for (const lang of LANGUAGES) {
                result[lang] = `${prefix[lang]}: ${target[lang]}`;
            }
            return result;
        }
    }

    // Eigennamen wie "DuoFern 406B2D" und unbekannte Texte als einfacher String.
    return en;
}

module.exports = { LANGUAGES, localizeName, lookup };
