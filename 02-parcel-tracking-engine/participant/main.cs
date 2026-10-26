using System;
using System.Diagnostics;

while (true)
{
    var line = Console.ReadLine();
    if (line == null)
    {
        Environment.Exit(0);
    }

    Console.Error.WriteLine($"recieved: {line}");
}
