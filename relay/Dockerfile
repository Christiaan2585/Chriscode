FROM python:3.12-slim
# The relay uses only the standard library.
WORKDIR /app
COPY relay/__init__.py relay/server.py /app/relay/
RUN useradd --system --no-create-home relay
USER relay
EXPOSE 8447
ENTRYPOINT ["python", "-m", "relay.server", "--host", "0.0.0.0", "--port", "8447"]
