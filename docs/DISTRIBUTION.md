# Firefox Extension Distribution

To share the extension with others without them needing to load it temporarily:

1.  **Build the package:**
    ```powershell
    ./manage.ps1 pack-ff
    ```
    This will create `dist/awbw_enhancements_ff.zip`.

2.  **Sign the extension:**
    - Go to the [Firefox Developer Hub](https://addons.mozilla.org/en-US/developers/).
    - Submit the `dist/awbw_enhancements_ff.zip` file.
    - Choose **"On your own"** (Self-distributed) if you want to share the `.xpi` file directly, or **"On this site"** to list it on the store.
    - Once signed, you can distribute the `.xpi` file to testers. They can install it by dragging it into Firefox, and it will stay installed.
