import zipfile
import os
import sys

def zip_files(output_filename, source_paths):
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_filename)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in source_paths:
            if os.path.isfile(path):
                # Add file, ensuring arcname uses forward slashes
                zf.write(path, os.path.basename(path))
            elif os.path.isdir(path):
                for root, dirs, files in os.walk(path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # Calculate relative path from current working directory
                        rel_path = os.path.relpath(file_path, os.getcwd())
                        # Force forward slashes for zip archive
                        archive_name = rel_path.replace(os.sep, '/')
                        zf.write(file_path, archive_name)
    
    print(f"Successfully created {output_filename}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python zip_dist.py <output_zip> <source_file_or_dir> ...")
        sys.exit(1)
        
    output = sys.argv[1]
    sources = sys.argv[2:]
    zip_files(output, sources)
