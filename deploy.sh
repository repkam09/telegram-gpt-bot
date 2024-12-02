# Pull the latest changes from the repository
git pull

# Build the docker image
docker build -t hennos-gpt .

# Stop and remove the current container
docker compose down

# Create backup directory if it doesn't exist
mkdir -p ./data/bak

# Get the current timestamp
timestamp=$(date +"%Y%m%d%H%M%S")

# Create a backup of the SQLite database
cp ./data/hennos.sqlite ./data/bak/hennos_${timestamp}.sqlite

# Start the new container
docker compose up -d
