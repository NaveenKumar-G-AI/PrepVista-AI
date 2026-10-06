import sys

with open("app/config.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    new_lines.append(line)
    if "raise ValueError(f\"{field_name} must use HTTPS in production\")" in line:
        tls_check = """
            if self.DATABASE_URL:
                if "localhost" not in self.DATABASE_URL and "127.0.0.1" not in self.DATABASE_URL:
                    if "?sslmode=" not in self.DATABASE_URL and "&sslmode=" not in self.DATABASE_URL:
                        raise ValueError("Production DATABASE_URL to a remote host must explicitly specify an sslmode (e.g. ?sslmode=require)")
"""
        new_lines.append(tls_check)

with open("app/config.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
