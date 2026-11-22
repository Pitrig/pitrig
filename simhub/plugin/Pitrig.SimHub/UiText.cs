using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security;
using System.Text;
using System.Web.Script.Serialization;

namespace Pitrig.SimHub
{
    internal static partial class UiText
    {
        private static readonly string ChoiceFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Pitrig", "language.json");

        private static readonly string Language = Resolve();

        private static string Resolve()
        {
            var chosen = Chosen();
            if (chosen != null) return chosen;
            var system = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
            return IsLanguage(system) ? system : "en";
        }

        private static string Chosen()
        {
            try
            {
                if (!File.Exists(ChoiceFile)) return null;
                var root = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(ChoiceFile)) as Dictionary<string, object>;
                return root != null && root.TryGetValue("language", out var value) && value is string code && IsLanguage(code)
                    ? code
                    : null;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException ||
                                              exception is SecurityException || exception is ArgumentException ||
                                              exception is InvalidOperationException)
            {
                return null;
            }
        }

        private static string Fill(string template, params object[] pairs)
        {
            var text = new StringBuilder(template);
            for (var index = 0; index + 1 < pairs.Length; index += 2)
            {
                text.Replace("{" + pairs[index] + "}", Convert.ToString(pairs[index + 1], CultureInfo.InvariantCulture));
            }
            return text.ToString();
        }
    }
}
