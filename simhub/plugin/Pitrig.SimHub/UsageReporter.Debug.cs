namespace Pitrig.SimHub
{
    internal sealed partial class UsageReporter
    {
        static partial void MarkDevelopment(ref bool development)
        {
            development = true;
        }
    }
}
