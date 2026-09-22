using Azure.Storage.Blobs;
using Azure.Storage.Sas;

namespace Neighborhood.Storage;

/// <summary>
/// Punto de entrada único para Blob Storage: hoy solo guarda los
/// comprobantes de pago (dbo.Payments.ReceiptBlobPath), en un storage
/// account de Azure aparte del que usa el runtime de Functions
/// (AzureWebJobsStorage — en desarrollo local ni siquiera es una cuenta
/// real, ver local.settings.json). La conexión es por connection string
/// (cuenta + clave), mismo criterio que SqlConnectionFactory.cs: simple
/// para arrancar, sin Managed Identity todavía. El contenedor
/// ("comprobantes") no tiene lectura pública, así que tanto subir como
/// ver un comprobante necesitan pasar por acá para conseguir una URL con
/// SAS de corta duración — nunca se expone la connection string ni una
/// URL sin firmar al frontend.
/// </summary>
public static class BlobStorageService
{
    private const string ContainerName = "comprobantes";
    private static readonly TimeSpan SasLifetime = TimeSpan.FromMinutes(10);

    // Extensiones que puede tener un comprobante: fotos del recibo
    // (jpg/png) o el PDF que a veces manda el banco. Cualquier otra cosa
    // se rechaza antes de pedir la URL de subida (ver Payments.cs).
    public static readonly HashSet<string> AllowedExtensions =
        new(StringComparer.OrdinalIgnoreCase) { "jpg", "jpeg", "png", "pdf" };

    private static string ConnectionString =>
        Environment.GetEnvironmentVariable("BlobStorageConnectionString")
            ?? throw new InvalidOperationException(
                "Missing 'BlobStorageConnectionString' app setting. Add it to local.settings.json for local development.");

    private static BlobContainerClient GetContainerClient() =>
        new BlobServiceClient(ConnectionString).GetBlobContainerClient(ContainerName);

    // Nombre de blob nuevo y único para un comprobante de pago:
    // "{unitId}/{guid}.{ext}" dentro del contenedor "comprobantes" —
    // agrupado por unidad, no por pago, porque el pago todavía no existe
    // cuando se pide la URL de subida (el flujo sube el archivo antes de
    // crear el registro en CreatePayment, ver Payments.cs).
    public static string NewBlobPath(int unitId, string extension) =>
        $"{unitId}/{Guid.NewGuid():N}.{extension.ToLowerInvariant()}";

    // Igual que NewBlobPath, pero para el comprobante de un Gasto:
    // "expenses/{vendorId}/{guid}.{ext}" -- con el prefijo "expenses/"
    // para no mezclar comprobantes de gastos con los de pagos en el
    // mismo contenedor (un UnitId y un VendorId son numeraciones
    // independientes, así que sin el prefijo podrían "pisarse" la misma
    // carpeta por casualidad). Agrupado por proveedor, no por gasto,
    // mismo motivo que Payments: el gasto todavía no existe cuando se
    // pide la URL de subida (ver CreateExpense en Expenses.cs).
    public static string NewExpenseBlobPath(int vendorId, string extension) =>
        $"expenses/{vendorId}/{Guid.NewGuid():N}.{extension.ToLowerInvariant()}";

    /// <summary>
    /// URL con SAS de escritura para subir un comprobante nuevo
    /// directamente desde el navegador, sin que el archivo pase por el
    /// Function — evita los límites de tamaño/tiempo de Azure Functions
    /// en el plan de Consumo. La SAS firma únicamente ese blob puntual
    /// (nunca el contenedor entero) y expira a los 10 minutos.
    /// </summary>
    public static (Uri UploadUrl, DateTimeOffset ExpiresAt) GetUploadUrl(string blobPath)
    {
        var blobClient = GetContainerClient().GetBlobClient(blobPath);
        var expiresAt = DateTimeOffset.UtcNow.Add(SasLifetime);

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = ContainerName,
            BlobName = blobPath,
            Resource = "b",
            ExpiresOn = expiresAt,
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Write);

        return (blobClient.GenerateSasUri(sasBuilder), expiresAt);
    }

    /// <summary>
    /// URL con SAS de solo lectura para ver/descargar un comprobante ya
    /// subido (PaymentShow). Devuelve null si no hay nada que firmar
    /// (pago sin comprobante todavía).
    /// </summary>
    public static (Uri ViewUrl, DateTimeOffset ExpiresAt)? GetViewUrl(string? blobPath)
    {
        if (string.IsNullOrWhiteSpace(blobPath))
        {
            return null;
        }

        var blobClient = GetContainerClient().GetBlobClient(blobPath);
        var expiresAt = DateTimeOffset.UtcNow.Add(SasLifetime);

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = ContainerName,
            BlobName = blobPath,
            Resource = "b",
            ExpiresOn = expiresAt,
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Read);

        return (blobClient.GenerateSasUri(sasBuilder), expiresAt);
    }
}
