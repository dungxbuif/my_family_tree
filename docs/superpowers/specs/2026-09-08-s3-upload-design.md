# S3 Upload Design

## Goal

Store every new Family Tree avatar and gallery image in the private `family-tree`
bucket on the existing RustFS S3 service, while preserving the existing image
URLs used by the UI.

## Data flow

1. An authenticated admin or editor asks `POST /api/uploads/presign` for an
   upload URL, providing only a validated image filename, MIME type, size and
   destination (`avatars` or `gallery`).
2. The browser uploads the file directly to RustFS using the returned signed
   `PUT` URL; file bytes never pass through a Next.js Server Action.
3. The client submits the existing member/gallery Server Action with the small
   `/api/storage/<object-key>` URL returned by the presign endpoint.
4. The storage route retrieves the object from RustFS using server credentials.
   This keeps buckets private and avoids exposing long-lived S3 credentials or
   public object URLs.

## Constraints

- Only `admin` and `editor` profiles can request upload URLs or delete objects.
- Accept JPEG, PNG, WebP and GIF files up to 10 MiB.
- The S3 endpoint, bucket, region and credentials live only in the production
  environment file; no credential is committed or logged.
- The existing `/api/storage/...` URL contract remains valid for the UI and
  database records.
- Existing local storage is not used for new uploads.

## Verification

- Unit-test object-key and upload-input validation.
- Build/type-check the application.
- Create the RustFS bucket, deploy the image, upload an image larger than 1 MiB
  through the member and gallery UI flows, then fetch it through `/api/storage`.
