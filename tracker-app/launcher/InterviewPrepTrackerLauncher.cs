using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class InterviewPrepTrackerLauncher
{
    private const string AppDirectory = @"D:\Code Projects\CareerPrep\tracker-app";
    private const string NpmPath = @"C:\Program Files\nodejs\npm.cmd";
    private const string ApiHealthUrl = "http://127.0.0.1:3001/api/health";
    private const string PageUrl = "http://127.0.0.1:5173/";
    private static readonly string LogPath = Path.Combine(AppDirectory, "launcher", "tracker-launcher.log");

    [STAThread]
    private static void Main()
    {
        try
        {
            if (!Directory.Exists(AppDirectory))
            {
                throw new DirectoryNotFoundException("Tracker app folder was not found: " + AppDirectory);
            }

            if (!IsUrlReady(ApiHealthUrl) || !IsUrlReady(PageUrl))
            {
                StartDevServer();
            }

            if (!WaitForUrl(PageUrl, TimeSpan.FromSeconds(45)))
            {
                throw new TimeoutException("The tracker page did not become ready at " + PageUrl + Environment.NewLine + "Check the launcher log at " + LogPath);
            }

            Process.Start(new ProcessStartInfo(PageUrl) { UseShellExecute = true });
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                exception.Message,
                "Interview Prep Tracker Launcher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    private static void StartDevServer()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(LogPath));

        string command = string.Format(
            "/c \"\"{0}\" run dev > \"{1}\" 2>&1\"",
            NpmPath,
            LogPath
        );

        Process.Start(new ProcessStartInfo("cmd.exe", command)
        {
            WorkingDirectory = AppDirectory,
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    private static bool WaitForUrl(string url, TimeSpan timeout)
    {
        DateTime deadline = DateTime.UtcNow.Add(timeout);

        while (DateTime.UtcNow < deadline)
        {
            if (IsUrlReady(url))
            {
                return true;
            }

            Thread.Sleep(500);
        }

        return false;
    }

    private static bool IsUrlReady(string url)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = 1000;
            request.ReadWriteTimeout = 1000;

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                int statusCode = (int)response.StatusCode;
                return statusCode >= 200 && statusCode < 400;
            }
        }
        catch
        {
            return false;
        }
    }
}
