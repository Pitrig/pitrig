namespace Pitrig.SimHub
{
    internal sealed class BoardInfo
    {
        public string Board { get; private set; } = string.Empty;

        public string Firmware { get; private set; } = string.Empty;

        public bool SafeMode { get; private set; }

        public static BoardInfo Parse(string text)
        {
            var info = new BoardInfo();
            foreach (var pair in text.Split(','))
            {
                var separator = pair.IndexOf('=');
                if (separator <= 0) continue;
                var key = pair.Substring(0, separator);
                var value = pair.Substring(separator + 1);
                switch (key)
                {
                    case "board":
                        info.Board = value;
                        break;
                    case "firmware":
                        info.Firmware = value;
                        break;
                    case "safe_mode":
                        info.SafeMode = value == "1";
                        break;
                }
            }
            return info;
        }
    }
}
