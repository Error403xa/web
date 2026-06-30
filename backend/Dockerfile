# 构建阶段
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 复制项目文件
COPY ["WebRemoteControl.API/WebRemoteControl.API.csproj", "WebRemoteControl.API/"]
COPY ["WebRemoteControl.Core/WebRemoteControl.Core.csproj", "WebRemoteControl.Core/"]
COPY ["WebRemoteControl.Infrastructure/WebRemoteControl.Infrastructure.csproj", "WebRemoteControl.Infrastructure/"]

# 还原依赖
RUN dotnet restore "WebRemoteControl.API/WebRemoteControl.API.csproj"

# 复制所有文件并构建
COPY . .
WORKDIR "/src/WebRemoteControl.API"
RUN dotnet build "WebRemoteControl.API.csproj" -c Release -o /app/build

# 发布阶段
FROM build AS publish
RUN dotnet publish "WebRemoteControl.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

# 运行时阶段
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 80
EXPOSE 5555

COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "WebRemoteControl.API.dll"]

